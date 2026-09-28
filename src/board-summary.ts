import { DONE_COLUMN, type Board } from './board';

// What the manager says about a project's board without opening it: how much is in each column, and
// which cards were touched last across every open project. Read off the same Board the board view
// draws, so the two can never count differently.

export type ColumnCount = { name: string; count: number };

// One figure per column that has anything in it, in the board's own order, so `2 Doing · 1 Review`
// reads left to right the way the board does. Done is left out: it only ever grows, and a `214 Done`
// on every row would be the widest thing on it while saying nothing about today.
// Only cards with no parent are counted. A card split into six subtasks is one piece of work, and
// counting the subtasks would make it look like seven.
export function columnCounts(board: Board): ColumnCount[] {
  return board.columns
    .filter((column) => column.name.toLowerCase() !== DONE_COLUMN.toLowerCase())
    .map((column) => ({
      name: column.name,
      count: column.cards.filter((card) => card.parent === null).length,
    }))
    .filter((column) => column.count > 0);
}

export type ActivityEntry = {
  project: string;
  title: string;
  column: string;
  // When the card last changed, as an ISO string: a move stamps it, and so does an edit.
  at: string;
  id: string;
};

// How many cards the activity list holds. Enough to cover a working day across a handful of projects,
// few enough that it ends before the screen does.
export const ACTIVITY_LIMIT = 12;

// The cards touched most recently across every board handed in, newest first. A card with no
// `updatedAt` is left off: it was written before the field existed, and placing it anywhere on a
// newest-first list would be a guess dressed as a fact.
// Subtasks are included: moving one to Done is as much something that happened as moving its parent.
export function recentActivity(
  boards: readonly { project: string; board: Board }[],
  limit: number = ACTIVITY_LIMIT,
): ActivityEntry[] {
  const entries = boards.flatMap(({ project, board }) => board.columns.flatMap((column) => (
    column.cards.flatMap((card) => (card.updatedAt === undefined || Number.isNaN(Date.parse(card.updatedAt))
      ? []
      : [{ project, title: card.title, column: column.name, at: card.updatedAt, id: card.id }]))
  )));
  return entries
    .sort((first, second) => Date.parse(second.at) - Date.parse(first.at))
    .slice(0, limit);
}
