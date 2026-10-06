import { timeOf } from './age';
import { childrenOf, PRIORITIES, type Board, type Card, type Priority } from './board';

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
// `older` is the far side of the longest window, so a card is in exactly one of `month` and `older`.
const AGE_DAYS: Record<Exclude<Age, 'any'>, number> = { today: 1, week: 7, month: 30, older: 30 };

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
  return age === 'older' ? days > AGE_DAYS.older : days <= AGE_DAYS[age];
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
