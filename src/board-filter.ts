import type { Action } from './actions';
import { timeOf } from './age';
import { cardAt, childrenOf, PRIORITIES, type Board, type Card, type Priority, type Selection } from './board';
import { clampIndex } from './clamp-index';
import type { Direction } from './terminals';

// What the board is narrowed to. Held by the view while you are on the board and dropped when you
// leave, so nothing here is ever written to the file.
export type Presence = 'any' | 'has' | 'none';
export type Family = 'any' | 'top-level' | 'subtasks' | 'parents';
export type Age = 'any' | 'today' | 'week' | 'month' | 'older';
export type BoardFilter = {
  // Looked for in the title, the description, the comments and the branch.
  text: string;
  // Empty means every priority. A list rather than one level, because "urgent or high" is the
  // question a messy Todo is usually asked.
  priorities: Priority[];
  family: Family;
  branch: Presence;
  pullRequest: Presence;
  comments: Presence;
  created: Age;
  updated: Age;
};

// The order Left and Right walk each choice in.
export const PRESENCES: readonly Presence[] = ['any', 'has', 'none'];
export const FAMILIES: readonly Family[] = ['any', 'top-level', 'subtasks', 'parents'];
export const AGES: readonly Age[] = ['any', 'today', 'week', 'month', 'older'];

const DAY = 86_400_000;
// How far back each window reaches. `older` is the far side of `month`, so a card is in one of the two.
const WINDOW_DAYS: Record<Exclude<Age, 'any' | 'older'>, number> = { today: 1, week: 7, month: 30 };

export function emptyFilter(): BoardFilter {
  return {
    text: '', priorities: [], family: 'any', branch: 'any', pullRequest: 'any', comments: 'any',
    created: 'any', updated: 'any',
  };
}

// Asked of the summary rather than of each field again, so a field the strip would not mention can
// never leave the board narrowed with nothing on screen saying so.
export function isFilterActive(filter: BoardFilter): boolean {
  return filterSummary(filter) !== '';
}

function present(presence: Presence, has: boolean): boolean {
  return presence === 'any' || (presence === 'has') === has;
}

// A card with no stamp has an unknown age, which is no age at all: it matches only `any`. Placing it
// anywhere else would be a guess dressed as a fact.
function aged(age: Age, stamp: string | undefined, now: number): boolean {
  if (age === 'any') return true;
  const time = timeOf(stamp);
  if (time === undefined) return false;
  const days = (now - time) / DAY;
  return age === 'older' ? days > WINDOW_DAYS.month : days <= WINDOW_DAYS[age];
}

function inFamily(board: Board, card: Card, wanted: Family): boolean {
  switch (wanted) {
    case 'any': return true;
    case 'top-level': return card.parent === null;
    case 'subtasks': return card.parent !== null;
    case 'parents': return childrenOf(board, card.id).length > 0;
  }
}

function written(card: Card): string {
  return [card.title, card.notes, card.branch ?? '', ...(card.comments ?? []).map((comment) => comment.body)]
    .join('\n').toLowerCase();
}

export function cardMatches(board: Board, card: Card, filter: BoardFilter, now: number): boolean {
  const text = filter.text.trim().toLowerCase();
  return (text === '' || written(card).includes(text))
    && (filter.priorities.length === 0 || filter.priorities.includes(card.priority))
    && inFamily(board, card, filter.family)
    && present(filter.branch, card.branch !== undefined)
    && present(filter.pullRequest, card.pullRequest !== undefined)
    && present(filter.comments, (card.comments ?? []).length > 0)
    && aged(filter.created, card.createdAt, now)
    && aged(filter.updated, card.updatedAt, now);
}

// The real index of every card the filter keeps, column by column. The selection stays a real index,
// so every operation in board.ts works unchanged; this is what the view draws and steps over.
export function visibleRows(board: Board, filter: BoardFilter, now: number): number[][] {
  return board.columns.map((column) => column.cards.flatMap((card, index) => (
    cardMatches(board, card, filter, now) ? [index] : [])));
}

const PRESENCE_WORDS: Record<Exclude<Presence, 'any'>, string> = { has: 'has', none: 'no' };
const AGE_WORDS: Record<Exclude<Age, 'any'>, string> = {
  today: 'today', week: 'in 7 days', month: 'in 30 days', older: 'over 30 days ago',
};

function presenceWords(presence: Presence, noun: string): string {
  return presence === 'any' ? '' : `${PRESENCE_WORDS[presence]} ${noun}`;
}

function ageWords(age: Age, verb: string): string {
  return age === 'any' ? '' : `${verb} ${AGE_WORDS[age]}`;
}

// The strip's sentence: only the fields that narrow anything, in the dialog's order. Empty means the
// filter keeps every card.
export function filterSummary(filter: BoardFilter): string {
  const text = filter.text.trim();
  return [
    text === '' ? '' : `"${text}"`,
    PRIORITIES.filter((priority) => filter.priorities.includes(priority)).join(', '),
    filter.family === 'any' ? '' : filter.family,
    presenceWords(filter.branch, 'branch'),
    presenceWords(filter.pullRequest, 'pull request'),
    presenceWords(filter.comments, 'comments'),
    ageWords(filter.created, 'created'),
    ageWords(filter.updated, 'updated'),
  ].filter((part) => part !== '').join(' · ');
}

// A selection on a card the filter hides moves to the first card it keeps in that column. A column
// keeping nothing rests on row 0; the view refuses card keys there, since row 0 may be a hidden card.
export function settleSelection(visible: number[][], selection: Selection): Selection {
  const rows = visible[selection.column] ?? [];
  if (rows.includes(selection.card)) return selection;
  const card = rows[0] ?? 0;
  // The same object when nothing moves, because render settles on every draw.
  return card === selection.card ? selection : { column: selection.column, card };
}

// The rows with the selected card among them, whatever the filter says. A card you are typing into
// stays on screen until you finish — a blank new card matches no text, and its box would never draw.
export function keepingRow(visible: number[][], selection: Selection): number[][] {
  const rows = visible[selection.column];
  if (rows === undefined || rows.includes(selection.card)) return visible;
  return visible.map((entry, column) => (column === selection.column
    ? [...entry, selection.card].sort((first, second) => first - second)
    : entry));
}

// The arrows over a filtered board. Up and down walk the rows the filter keeps; left and right keep
// your place among them in the next column, clamped to how many it shows.
export function stepSelection(visible: number[][], selection: Selection, direction: Direction): Selection {
  const here = visible[selection.column] ?? [];
  const position = Math.max(0, here.indexOf(selection.card));
  if (direction === 'up' || direction === 'down') {
    const next = here[clampIndex(position + (direction === 'down' ? 1 : -1), here.length - 1)];
    return next === undefined ? selection : { column: selection.column, card: next };
  }
  const column = clampIndex(selection.column + (direction === 'right' ? 1 : -1), visible.length - 1);
  if (column === selection.column) return selection;
  const there = visible[column];
  return { column, card: there[clampIndex(position, there.length - 1)] ?? 0 };
}

// Shift+Up and Shift+Down while filtered: the row to hand dropCard so the card trades places with the
// next card you can see, not with one the filter hides. dropCard reads a row as "before the card now
// there", so going down is one past the neighbour. Null when there is nothing that way.
export function reorderRow(visible: number[][], selection: Selection, direction: 'up' | 'down'): number | null {
  const rows = visible[selection.column] ?? [];
  const position = rows.indexOf(selection.card);
  if (position === -1) return null;
  const neighbour = rows[position + (direction === 'down' ? 1 : -1)];
  if (neighbour === undefined) return null;
  return direction === 'down' ? neighbour + 1 : neighbour;
}

// A drag measures rows among the cards on screen; dropCard wants a row of the whole column. Past the
// last card shown is just after it, not the end of the column, which may be a run of hidden cards.
export function realRow(visible: number[][], column: number, visibleRow: number, columnLength: number): number {
  const rows = visible[column] ?? [];
  if (visibleRow < rows.length) return rows[visibleRow];
  return rows.length === 0 ? columnLength : rows[rows.length - 1] + 1;
}

// The board keys that act on the selected card rather than on the board or the column. Moving,
// renaming, deleting a card the filter hides would be acting on a card you cannot see.
const CARD_ACTIONS: readonly Action['kind'][] = [
  'board-move', 'board-attach', 'board-detach', 'board-edit', 'board-priority', 'board-delete', 'board-open',
];

// Whether this key would land on a card the filter is hiding. Only happens in a column where the
// filter keeps nothing, which still selects row 0 — and row 0 is a real card.
export function actsOnHiddenCard(board: Board, visible: number[][], selection: Selection, kind: Action['kind']): boolean {
  return CARD_ACTIONS.includes(kind)
    && cardAt(board, selection) !== undefined
    && !(visible[selection.column] ?? []).includes(selection.card);
}

// What the board draws and where the selection rests, once per render. While a box is open — or about
// to open, as `n` does on a blank card no filter matches — the selection is the card being typed into
// and it stays drawn; moving the selection off it would put the box on a card you did not open.
export function rowsToDraw(
  visible: number[][], selection: Selection, typing: boolean,
): { visible: number[][]; selection: Selection } {
  if (typing) return { visible: keepingRow(visible, selection), selection };
  return { visible, selection: settleSelection(visible, selection) };
}

// The row of the card above the selection on screen, for Tab to attach to, or -1 when nothing you
// can see is above it. Under a filter the card directly above in the column may be one it hides.
export function rowAbove(visible: number[][], selection: Selection): number {
  const rows = visible[selection.column] ?? [];
  const position = rows.indexOf(selection.card);
  return position > 0 ? rows[position - 1] : -1;
}
