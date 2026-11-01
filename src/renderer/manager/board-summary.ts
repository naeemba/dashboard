import { timeOf } from './age';
import { columnNamed, DONE_COLUMN, type Board } from './board';

// What the manager says about a project's board without opening it: how much is in each column, and
// which cards were touched last across every open project. Read off the same Board the board view
// draws, so the two can never count differently.

export type ColumnCount = { name: string; count: number };

// One figure per column that has anything in it, in the board's own order, so `2 Doing · 1 Review`
// reads left to right the way the board does. Done is left out: it only ever grows, and a `214 Done`
// on every row would be the widest thing on it while saying nothing about today.
// A subtask sitting in its parent's column is not counted: a card split into six subtasks is one
// piece of work, and counting them would make it look like seven. A subtask moved on to a column of
// its own is counted there, or a card in Todo with a piece in Review would show no Review at all.
export function columnCounts(board: Board): ColumnCount[] {
  const done = columnNamed(board, DONE_COLUMN);
  return board.columns
    .filter((_column, index) => index !== done)
    .map((column) => {
      const here = new Set(column.cards.map((card) => card.id));
      return {
        name: column.name,
        count: column.cards.filter((card) => card.parent === null || !here.has(card.parent)).length,
      };
    })
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
  // Each stamp parsed once, rather than again on every comparison the sort makes.
  const entries = boards.flatMap(({ project, board }) => board.columns.flatMap((column) => (
    column.cards.flatMap((card) => {
      const time = timeOf(card.updatedAt);
      if (time === undefined) return [];
      return [{ time, entry: { project, title: card.title, column: column.name, at: card.updatedAt!, id: card.id } }];
    })
  )));
  return entries
    .sort((first, second) => second.time - first.time)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
