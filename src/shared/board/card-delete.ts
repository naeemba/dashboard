import { CANCELLED_COLUMN, cardAt, columnNamed, type Board, type Selection } from './board';
import { keyboardMoveRefusal } from './done-lock';

// What the delete key does to the selected card. A card that will not be done is kept, so the key
// moves it to Cancelled; only a card already there is deleted for good, after the confirm
// (board-decision-4). Null when nothing is selected. A board with no Cancelled column, which reading
// it always adds, deletes as before rather than doing nothing. A card in Done is refused with Done's
// lock (board-decision-3): the move to Cancelled is a keyboard move like Shift with an arrow.
export type DeleteKeyOutcome =
  | { kind: 'cancel'; column: number } | { kind: 'delete' } | { kind: 'refused'; reason: string } | null;

export function deleteKeyOutcome(board: Board, selection: Selection): DeleteKeyOutcome {
  if (!cardAt(board, selection)) return null;
  const refusal = keyboardMoveRefusal(board, selection);
  if (refusal !== null) return { kind: 'refused', reason: refusal };
  const cancelled = columnNamed(board, CANCELLED_COLUMN);
  if (cancelled === -1 || selection.column === cancelled) return { kind: 'delete' };
  return { kind: 'cancel', column: cancelled };
}
