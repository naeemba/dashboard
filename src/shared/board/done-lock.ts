import { DONE_COLUMN, columnNamed, type Board, type Selection } from './board';

// Why a keyboard move of the selected card is refused, or null when it is allowed. A card in Done is
// finished and merged: Shift with an arrow on it is more likely the highlight sitting on the wrong card
// than a decision, and walking it back past Review and Ship would start a review and a ship again. A
// drag picks the card up by hand, so it is still a move (board-decision-3).
export function keyboardMoveRefusal(board: Board, selection: Selection): string | null {
  const card = board.columns[selection.column]?.cards[selection.card];
  if (card === undefined || selection.column !== columnNamed(board, DONE_COLUMN)) return null;
  return `"${card.title}" is in Done and moves only by dragging it, so a key on the wrong card moves nothing`;
}
