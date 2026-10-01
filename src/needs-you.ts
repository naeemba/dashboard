import { timeOf } from './age';
import {
  DOING_COLUMN, DONE_COLUMN, REVIEW_COLUMN, columnNamed, pullRequestLabel, type Board, type Card,
} from './board';
import { isAlerting, type ManagerRow, type PaneSummary } from './manager';
import type { WorktreeEntry } from './worktree-store';

// Everything across the open projects that is waiting on you, as one list. The manager's rows say what
// every project is doing; this says what to do next, so it is the first thing on the page and the
// thing the next-item key walks.

// A pane on a card in Doing that has printed nothing for this long is taken to have stopped. Long
// enough that a slow test run is not flagged, short enough to be caught before lunch is over.
export const STALL_MS = 30 * 60_000;

export type NeedKind = 'asking' | 'exited' | 'stalled' | 'review' | 'leftover';

// Where Enter on the item takes you: a pane, a card on its project's board, or a worktree, which lands
// on its pane when it has one and says why not when it does not.
export type NeedTarget =
  | { kind: 'pane'; index: number }
  | { kind: 'card'; cardId: string }
  | { kind: 'worktree'; entry: WorktreeEntry };

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
};

// What each kind says it wants, in words.
export const NEED_LABELS: Record<NeedKind, string> = {
  asking: 'asking',
  exited: 'died',
  stalled: 'quiet on a Doing card',
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
    kind: pane.state === 'waiting' ? 'asking' : 'exited',
    subject: pane.name,
    since: pane.lastPrintedAt,
    target: { kind: 'pane', index: pane.index },
  }));
}

// A pane whose state is `quiet` but whose card says the work is not finished. An alerting pane is
// already on the list as asking or died, and a pane that has printed nothing yet has no age to judge.
function isStalled(pane: PaneSummary | undefined, now: number): pane is PaneSummary {
  return pane !== undefined && !isAlerting(pane) && pane.lastPrintedAt > 0
    && now - pane.lastPrintedAt >= STALL_MS;
}

function worktreeNeeds(
  row: ManagerRow, base: Base, board: Board | undefined, dirty: ReadonlySet<string>, now: number,
): Need[] {
  const doing = new Set(columnCards(board, DOING_COLUMN).map((card) => card.id));
  const done = new Map(columnCards(board, DONE_COLUMN).map((card) => [card.id, card]));
  return row.worktrees.flatMap((entry): Need[] => {
    const pane = entry.pane === null ? undefined : row.panes[entry.pane];
    if (doing.has(entry.cardId) && isStalled(pane, now)) {
      return [{ ...base, subject: entry.title, kind: 'stalled', since: pane.lastPrintedAt, target: { kind: 'pane', index: pane.index } }];
    }
    // The app removes a Done card's worktree on its own once no shell stands in it. One still here and
    // dirty is one git refused to remove, and it stays until you commit or throw the change away.
    const card = done.get(entry.cardId);
    if (card && dirty.has(entry.worktreePath)) {
      const since = timeOf(card.updatedAt) ?? timeOf(entry.startedAt) ?? 0;
      return [{ ...base, subject: entry.title, kind: 'leftover', since, target: { kind: 'worktree', entry } }];
    }
    return [];
  });
}

// A card sits in Review while an agent reviews its pull request and merges it. One with no review
// running is one the app could not start a review for, and nothing will move it but you.
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
  const id = target.kind === 'pane' ? `${target.index}`
    : target.kind === 'card' ? target.cardId : target.entry.worktreePath;
  return `need:${need.kind}:${need.slot}:${id}`;
}
