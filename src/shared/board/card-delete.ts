import { CANCELLED_COLUMN, cardAt, columnNamed, type Board, type Selection } from './board';
import { keyboardMoveRefusal } from './done-lock';

// What the delete key does to the selected card. A card that will not be done is kept, so the key
// moves it to Cancelled; only a card already there is deleted for good, after the confirm
// (board-decision-4). Null when nothing is selected. A board with no Cancelled column, which reading
// it always adds, deletes as before rather than doing nothing. A card in Done is deleted after the
// confirm rather than cancelled: Done's lock (board-decision-3) keeps a key from moving it, and the
// confirm keeps a stray `d` from doing anything unasked, so deleting it stays reachable by key.
export type DeleteKeyOutcome = { kind: 'cancel'; column: number } | { kind: 'delete' } | null;

export function deleteKeyOutcome(board: Board, selection: Selection): DeleteKeyOutcome {
  if (!cardAt(board, selection)) return null;
  if (keyboardMoveRefusal(board, selection) !== null) return { kind: 'delete' };
  const cancelled = columnNamed(board, CANCELLED_COLUMN);
  if (cancelled === -1 || selection.column === cancelled) return { kind: 'delete' };
  return { kind: 'cancel', column: cancelled };
}
