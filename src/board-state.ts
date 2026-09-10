import {
  addCard,
  cardAt,
  deleteCard,
  emptyBoard,
  hasSubtasks,
  pullRequestFrom,
  renameCard,
  setBranch,
  setNotes,
  setPullRequest,
  type Board,
  type Change,
  type Selection,
} from './board';
import { clampIndex } from './clamp-index';

// One step back, held in memory. `d` deletes on a single keystroke, so there has to be a way back
// from a mis-hit; anything deeper is a feature nobody asked for. The selection is kept with the
// board so undo puts the cursor back where the mis-hit happened, not at the top of the column.
type Step = { board: Board; selection: Selection };

export type BoardState = {
  board: Board;
  selection: Selection;
  previous: Step | null;
  // Whether the change coming next is the app finishing something you already started, rather than a
  // keystroke with an undo step of its own. `n` sets it: adding the blank card and committing the
  // typed title are two changes that have to undo as one, so only the first spends the step.
  nextChangeIsAutomatic: boolean;
};

export function initialBoardState(): BoardState {
  return { board: emptyBoard(), selection: { column: 0, card: 0 }, previous: null, nextChangeIsAutomatic: false };
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
    previous: state.nextChangeIsAutomatic ? state.previous : { board: state.board, selection: state.selection },
    nextChangeIsAutomatic: false,
  };
}

// The other way in to the same rule, for a change nothing marked in advance: the ship's move-back
// lands whenever git finishes, so there was no keystroke of yours before it to set the flag. The board
// moves and is written like any other change, and your undo step is left pointing where it pointed.
//
// It also leaves the flag alone, which is the whole reason the flag is a field and not an argument.
// Press `n`, start typing, and let a ship you began a minute ago land: it goes through here, and if it
// cleared the flag your Enter would spend a step of its own. `u` would then leave the untitled card
// sitting in the column instead of putting back the board from before `n`.
//
// Built on applyChange rather than beside it, so the no-op ruling stays in one place: the identity
// check is what stops apply() rewriting the file for a change that moved nothing.
export function applyAutomaticChange(state: BoardState, next: Change): BoardState {
  const applied = applyChange(state, next);
  if (applied === state) return state;
  return { ...applied, previous: state.previous, nextChangeIsAutomatic: state.nextChangeIsAutomatic };
}

export function undoChange(state: BoardState): BoardState {
  if (state.previous === null) return state;
  return { ...state.previous, previous: null, nextChangeIsAutomatic: false };
}

export function addBlankCard(state: BoardState, id: string): BoardState {
  return { ...applyChange(state, addCard(state.board, state.selection, id, '')), nextChangeIsAutomatic: true };
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
    if (hasSubtasks(state.board, state.selection)) return state;
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
    selection: { column: clampIndex(state.selection.column, board.columns.length - 1), card: 0 },
    previous: null,
    nextChangeIsAutomatic: false,
  };
}

// Enter and Escape both commit, as with a title. An empty box means the card has no branch, which is
// an ordinary state for a card — so it clears the field rather than refusing.
export function commitBranch(state: BoardState, branch: string): BoardState {
  const trimmed = branch.trim();
  if (trimmed === (cardAt(state.board, state.selection)?.branch ?? '')) return state;
  return applyChange(state, setBranch(state.board, state.selection, trimmed === '' ? undefined : trimmed));
}

// An empty box clears the number, the same as a branch. Anything else that is not a pull request
// number leaves the card as it was — the view asks pullRequestFrom on the same text and says why, so
// what is refused here and what is explained there cannot come apart.
export function commitPullRequest(state: BoardState, text: string): BoardState {
  const current = cardAt(state.board, state.selection)?.pullRequest;
  const number = text.trim() === '' ? undefined : pullRequestFrom(text);
  if (number === null || number === current) return state;
  return applyChange(state, setPullRequest(state.board, state.selection, number));
}
