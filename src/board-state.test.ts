import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITY, deleteCard, moveCard, renameCard, type Board, type Selection } from './board';
import {
  addBlankCard,
  applyChange,
  commitNotes,
  commitTitle,
  initialBoardState,
  loadBoard,
  undoChange,
  type BoardState,
} from './board-state';

function board(...columns: string[][]): Board {
  return {
    columns: columns.map((cardTitles, index) => ({
      name: `Column ${index}`,
      cards: cardTitles.map((title) => ({ id: title, title, notes: '', priority: DEFAULT_PRIORITY, parent: null })),
    })),
  };
}

function state(next: Board, selection: Selection): BoardState {
  return { ...initialBoardState(), board: next, selection };
}

function titles(next: BoardState): string[][] {
  return next.board.columns.map((column) => column.cards.map((card) => card.title));
}

describe('applyChange', () => {
  const start = state(board(['a', 'b'], []), { column: 0, card: 1 });

  it('keeps the board it replaces as the undo step', () => {
    const next = applyChange(start, deleteCard(start.board, start.selection));
    expect(titles(next)).toEqual([['a'], []]);
    expect(next.previous).toEqual({ board: start.board, selection: start.selection });
  });

  // Without this, pressing `d` on an empty column throws away the undo step for the move made a
  // second earlier — silently, since nothing on screen changes.
  it('hands back the same state when the operation did nothing', () => {
    const empty = state(board(['a'], []), { column: 1, card: 0 });
    expect(applyChange(empty, deleteCard(empty.board, empty.selection))).toBe(empty);
  });
});

describe('undoChange', () => {
  it('puts the board and the cursor back where the mis-hit happened', () => {
    const start = state(board(['a', 'b', 'c', 'd']), { column: 0, card: 3 });
    const undone = undoChange(applyChange(start, deleteCard(start.board, start.selection)));
    expect(titles(undone)).toEqual([['a', 'b', 'c', 'd']]);
    expect(undone.selection).toEqual({ column: 0, card: 3 });
  });

  // One step, not a history: a second `u` must not walk further back.
  it('does nothing twice, or with nothing to undo', () => {
    const start = state(board(['a', 'b']), { column: 0, card: 0 });
    expect(undoChange(start)).toBe(start);
    const undone = undoChange(applyChange(start, deleteCard(start.board, start.selection)));
    expect(undoChange(undone)).toBe(undone);
  });
});

describe('addBlankCard', () => {
  // `n` then typing a title is two changes that must undo as one: `u` after it leaves no blank card
  // behind, and puts back the board from before `n`.
  it('undoes as one step together with the title that follows', () => {
    const start = state(board(['a'], []), { column: 1, card: 0 });
    const added = addBlankCard(start, 'new-id');
    const named = commitTitle(added, 'Fix the resize race');
    expect(titles(named)).toEqual([['a'], ['Fix the resize race']]);
    expect(titles(undoChange(named))).toEqual([['a'], []]);
  });

  // Escape with nothing typed: the card that `n` added goes away rather than sitting there blank.
  it('drops the card again when the title is left empty', () => {
    const start = state(board([]), { column: 0, card: 0 });
    expect(titles(commitTitle(addBlankCard(start, 'new-id'), '   '))).toEqual([[]]);
  });
});

describe('commitTitle', () => {
  const start = state(board(['a', 'b']), { column: 0, card: 1 });

  it('renames the selected card', () => {
    expect(titles(commitTitle(start, '  renamed  '))).toEqual([['a', 'renamed']]);
  });

  it('deletes a card whose title is blank', () => {
    expect(titles(commitTitle(start, ''))).toEqual([['a']]);
  });

  // Opening a title to read it and pressing Escape must not spend the undo step on the move made
  // just before it — renameCard builds a fresh board even when the text is identical.
  it('is not a change when the title comes back unchanged', () => {
    const moved = applyChange(start, moveCard(start.board, start.selection, 'up'));
    const same = commitTitle(moved, 'b');
    expect(same).toBe(moved);
    expect(titles(undoChange(same))).toEqual([['a', 'b']]);
  });
});

// parseCard keeps a title and a description exactly as they are written, so a card hand-edited (or
// written by an agent) with trailing whitespace is the case both commits have to compare against.
describe('untrimmed text already on the card', () => {
  const written: Board = {
    columns: [{
      name: 'Todo',
      cards: [
        { id: 'a', title: 'a', notes: '', priority: DEFAULT_PRIORITY, parent: null },
        { id: 'b', title: 'b ', notes: 'Check the logs\n', priority: DEFAULT_PRIORITY, parent: null },
      ],
    }],
  };
  const selection: Selection = { column: 0, card: 1 };
  const moved = applyChange(state(written, selection), moveCard(written, selection, 'up'));

  // Move a card, press `e` to read its description, Escape straight back out: without the trim the
  // file is rewritten and `u` no longer undoes the move.
  it('opening and closing an untrimmed description is not a change', () => {
    expect(commitNotes(moved, 'Check the logs')).toBe(moved);
  });

  it('opening and closing an untrimmed title is not a change', () => {
    expect(commitTitle(moved, 'b')).toBe(moved);
  });
});

describe('loadBoard', () => {
  it('clears the undo step and keeps the column when the new board still has one', () => {
    const start = applyChange(
      state(board(['a'], ['b'], ['c']), { column: 2, card: 0 }),
      renameCard(board(['a'], ['b'], ['c']), { column: 2, card: 0 }, 'z'),
    );
    const loaded = loadBoard(start, board(['x'], ['y'], ['z']));
    expect(loaded.selection).toEqual({ column: 2, card: 0 });
    expect(loaded.previous).toBeNull();
  });

  it('pulls the selection back onto a board with fewer columns', () => {
    const start = state(board(['a'], ['b'], ['c']), { column: 2, card: 4 });
    expect(loadBoard(start, board(['x'])).selection).toEqual({ column: 0, card: 0 });
  });
});
