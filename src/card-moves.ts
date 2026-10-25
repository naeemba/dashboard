import type { Board } from './board';

// Which cards changed column between two reads of one board, as the log says it. Only moves: a reorder
// inside a column is noise, and a card added or deleted is on the board itself to see.
export function cardMoves(before: Board, after: Board): string[] {
  const columnOf = new Map<string, string>();
  for (const column of before.columns) for (const card of column.cards) columnOf.set(card.id, column.name);
  const moves: string[] = [];
  for (const column of after.columns) {
    for (const card of column.cards) {
      const from = columnOf.get(card.id);
      if (from !== undefined && from !== column.name) moves.push(`"${card.title}" ${from} → ${column.name}`);
    }
  }
  return moves;
}
