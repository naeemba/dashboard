import {
  addCard,
  cardAt,
  childrenOf,
  deleteCard,
  emptyBoard,
  renameCard,
  setNotes,
  type Board,
  type Change,
  type Selection,
} from './board';

// One step back, held in memory. `d` deletes on a single keystroke, so there has to be a way back
// from a mis-hit; anything deeper is a feature nobody asked for. The selection is kept with the
// board so undo puts the cursor back where the mis-hit happened, not at the top of the column.
type Step = { board: Board; selection: Selection };

export type BoardState = {
  board: Board;
  selection: Selection;
  previous: Step | null;
  // `n` is two changes — add the blank card, then commit the typed title — that must undo as one.
  // Set while that pair is in flight so the second change keeps the first one's `previous` instead
  // of overwriting it with the just-added blank card.
  addingCard: boolean;
};

export function initialBoardState(): BoardState {
  return { board: emptyBoard(), selection: { column: 0, card: 0 }, previous: null, addingCard: false };
}

// Every operation in board.ts returns the same board object, unchanged, when it has nothing to do —
// moving the last card further down, deleting from an empty column. This hands back the same state
// object for those, so a no-op neither burns the undo step nor rewrites the file: a real change made
// just before it stays recoverable.
export function applyChange(state: BoardState, next: Change): BoardState {
  if (next.board === state.board) return state;
  return {
    board: next.board,
    selection: next.selection,
    previous: state.addingCard ? state.previous : { board: state.board, selection: state.selection },
    addingCard: false,
  };
}

export function undoChange(state: BoardState): BoardState {
  if (state.previous === null) return state;
  return { ...state.previous, previous: null, addingCard: false };
}

export function addBlankCard(state: BoardState, id: string): BoardState {
  return { ...applyChange(state, addCard(state.board, state.selection, id, '')), addingCard: true };
}

// Enter and Escape both commit: what you typed is what you meant. A card left with an empty title is
// dropped rather than kept as a blank row, which is the only way `n` can leave one behind. Opening a
// title and closing it unchanged is not a change at all — otherwise reading a card would spend the
// undo step that the move you just made is sitting in.
//
// A card with subtasks is the exception: blanking its title is two keystrokes with no confirmation,
// unlike `d`, and dropping the card would leave every subtask pointing at an id no longer on the
// board. So this hands the state back unchanged instead, and the title stays whatever it was.
export function commitTitle(state: BoardState, title: string): BoardState {
  const trimmed = title.trim();
  if (trimmed === '') {
    const card = cardAt(state.board, state.selection);
    if (card && childrenOf(state.board, card.id).length > 0) return state;
    return applyChange(state, deleteCard(state.board, state.selection));
  }
  // Both sides trimmed: parseCard keeps a title exactly as it is written, so a hand-edited
  // `"title": "Ship it "` would otherwise never compare equal, and merely opening that card would spend
  // the undo step belonging to the move you made just before it.
  if (trimmed === cardAt(state.board, state.selection)?.title.trim()) return state;
  return applyChange(state, renameCard(state.board, state.selection, trimmed));
}

// Escape commits, because Enter is a newline in a description. An empty one is allowed and simply
// clears the card's notes — unlike a title, a card with no description is an ordinary card. Closing a
// description unchanged is not a change, for the same reason reading a title is not.
export function commitNotes(state: BoardState, notes: string): BoardState {
  const trimmed = notes.trim();
  if (trimmed === cardAt(state.board, state.selection)?.notes.trim()) return state;
  return applyChange(state, setNotes(state.board, state.selection, trimmed));
}

// A board read from disk starts fresh: nothing on it can be undone back to what was in memory. The
// column is kept if the new board still has one there, since switching away and back should not
// jump you to the left-hand column.
export function loadBoard(state: BoardState, board: Board): BoardState {
  return {
    board,
    selection: { column: Math.min(state.selection.column, board.columns.length - 1), card: 0 },
    previous: null,
    addingCard: false,
  };
}
