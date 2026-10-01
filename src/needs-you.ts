import { timeOf } from './age';
import {
  DONE_COLUMN, REVIEW_COLUMN, columnNamed, pullRequestLabel, type Board, type Card,
} from './board';
import { isAlerting, takesAnswer, type ManagerRow, type PaneSummary } from './manager';
import type { WorktreeEntry } from './worktree-store';

// Everything across the open projects that is waiting on you, as one list. The manager's rows say what
// every project is doing; this says what to do next, so it is the first thing on the page and the
// thing the next-item key walks.

// An agent's pane that has printed nothing for this long is taken to have stopped. Long enough that
// a slow test run is not flagged, short enough to be caught before lunch is over.
export const STALL_MS = 30 * 60_000;

export type NeedKind = 'asking' | 'exited' | 'stalled' | 'review' | 'leftover';

// Where Enter on the item takes you: a pane, or a card on its project's board.
export type NeedTarget =
  | { kind: 'pane'; index: number }
  | { kind: 'card'; cardId: string };

export type Need = {
  kind: NeedKind;
  slot: number;
  project: string;
  projectPath: string;
  // What the item is about: a pane's name, a card's title.
  subject: string;
  // When it started waiting on you, in milliseconds. The list is oldest first, so this is its order.
  since: number;
  target: NeedTarget;
  // The worktree a `leftover` item is about, which the remove key acts on. Enter goes to its card
  // instead: the worktree has usually lost its pane, and the card says why it was kept.
  worktree?: WorktreeEntry;
};

// What each kind says it wants, in words.
export const NEED_LABELS: Record<NeedKind, string> = {
  asking: 'asking',
  exited: 'died',
  stalled: 'agent gone quiet',
  review: 'in Review, no review running',
  leftover: 'Done, uncommitted work left',
};

function columnCards(board: Board | undefined, name: string): Card[] {
  return board?.columns[columnNamed(board, name)]?.cards ?? [];
}

// What every item from one project shares.
type Base = Pick<Need, 'slot' | 'project' | 'projectPath'>;

function paneNeeds(row: ManagerRow, base: Base): Need[] {
  return row.panes.filter(isAlerting).map((pane) => ({
    ...base,
    kind: takesAnswer(pane) ? 'asking' : 'exited',
    subject: pane.name,
    since: pane.lastPrintedAt,
    target: { kind: 'pane', index: pane.index },
  }));
}

// A quiet pane an agent is working a card in. An alerting pane is already on the list as asking or
// died, and a pane that has printed nothing yet has no age to judge.
function isStalled(pane: PaneSummary | undefined, now: number): pane is PaneSummary {
  return pane !== undefined && !isAlerting(pane) && pane.lastPrintedAt > 0
    && now - pane.lastPrintedAt >= STALL_MS;
}

function worktreeNeeds(
  row: ManagerRow, base: Base, board: Board | undefined, dirty: ReadonlySet<string>, now: number,
): Need[] {
  // Asked of the worktree record, not the card's column: the agent moves its card on the worktree's
  // own board, and the project's board still has it wherever the ship put it back. A Review card is
  // listed as one already, and a Done card's pane is finished, not stalled.
  const review = new Set(columnCards(board, REVIEW_COLUMN).map((card) => card.id));
  const done = new Map(columnCards(board, DONE_COLUMN).map((card) => [card.id, card]));
  return row.worktrees.flatMap((entry): Need[] => {
    const pane = entry.pane === null ? undefined : row.panes[entry.pane];
    const working = !entry.reviewing && !review.has(entry.cardId) && !done.has(entry.cardId);
    if (working && isStalled(pane, now)) {
      return [{ ...base, subject: entry.title, kind: 'stalled', since: pane.lastPrintedAt, target: { kind: 'pane', index: pane.index } }];
    }
    // The app removes a Done card's worktree on its own once no shell stands in it. One still here and
    // dirty is one git refused to remove, and it stays until you commit or throw the change away.
    const card = done.get(entry.cardId);
    if (card && dirty.has(entry.worktreePath)) {
      const since = timeOf(card.updatedAt) ?? timeOf(entry.startedAt) ?? 0;
      return [{
        ...base, subject: entry.title, kind: 'leftover', since, target: { kind: 'card', cardId: card.id }, worktree: entry,
      }];
    }
    return [];
  });
}

// A card sits in Review while an agent reviews its pull request and merges it. This lists the ones in
// Review that no pane on this machine is reviewing.
function reviewNeeds(row: ManagerRow, base: Base, board: Board | undefined): Need[] {
  const reviewing = new Set(row.worktrees.filter((entry) => entry.reviewing).map((entry) => entry.cardId));
  return columnCards(board, REVIEW_COLUMN).filter((card) => !reviewing.has(card.id)).map((card) => ({
    ...base,
    kind: 'review',
    subject: card.pullRequest === undefined ? card.title : `${pullRequestLabel(card.pullRequest)} ${card.title}`,
    since: timeOf(card.updatedAt) ?? 0,
    target: { kind: 'card', cardId: card.id },
  }));
}

// Oldest first: the thing that has waited longest is the one to do next. A stable sort, so two items
// from the same moment keep the order the projects are in.
export function needsYou(
  rows: readonly ManagerRow[],
  boardOf: (projectPath: string) => Board | undefined,
  dirty: ReadonlySet<string>,
  now: number = Date.now(),
): Need[] {
  return rows.flatMap((row) => {
    const board = boardOf(row.path);
    const base = { slot: row.slot, project: row.name, projectPath: row.path };
    return [...paneNeeds(row, base), ...worktreeNeeds(row, base, board, dirty, now), ...reviewNeeds(row, base, board)];
  }).sort((first, second) => first.since - second.since);
}

// One string per item, the way the manager's lines are named, so the highlight stays on an item while
// the list around it moves.
export function needKey(need: Need): string {
  const { target } = need;
  const id = target.kind === 'pane' ? `${target.index}` : target.cardId;
  return `need:${need.kind}:${need.slot}:${id}`;
}

// The order the next-thing key tries the items in: oldest first, starting after the one it last landed
// on, so pressing it again reaches the second item rather than the first one again.
export function needsInTurn(needs: readonly Need[], lastKey: string | null): Need[] {
  const after = needs.findIndex((need) => needKey(need) === lastKey) + 1;
  return [...needs.slice(after), ...needs.slice(0, after)];
}

// Where one press of the next-thing key lands. `jump` tries an item and answers '' when it landed, or
// why it could not. An item it cannot land on is passed over, so one stuck item does not hold the key
// on itself, and is not remembered, so the next press does not start after it. When none can be
// landed on, the first one's reason is the one said.
export function nextLanding(
  needs: readonly Need[], lastKey: string | null, jump: (need: Need) => string,
): { landedOn: string | null; reason: string } {
  const turn = needsInTurn(needs, lastKey);
  if (turn.length === 0) return { landedOn: null, reason: 'Nothing needs you' };
  let firstReason = '';
  for (const need of turn) {
    const reason = jump(need);
    if (reason === '') return { landedOn: needKey(need), reason: '' };
    firstReason ||= reason;
  }
  return { landedOn: null, reason: firstReason };
}
