import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIORITY, deleteCard, moveCard, renameCard, type Board, type Selection } from './board';
import {
  addBlankCard,
  applyAutomaticChange,
  applyChange,
  commitBranch,
  commitNotes,
  commitPullRequest,
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

// The ship's move-back. Without this, `u` after a ship that worked puts the card back into Ship and
// writes it there — a shipped card in Ship on main, which is the one state the design forbids, one
// keystroke away.
describe('applyAutomaticChange', () => {
  const start = state(board(['a'], []), { column: 0, card: 0 });

  it('moves the board without spending the undo step', () => {
    const shipped = applyChange(start, moveCard(start.board, start.selection, 'right'));
    expect(titles(shipped)).toEqual([[], ['a']]);
    const back = applyAutomaticChange(shipped, moveCard(shipped.board, shipped.selection, 'left'));
    expect(titles(back)).toEqual([['a'], []]);
    // The step the user's own move left, not the board with the card in the second column.
    expect(back.previous).toBe(shipped.previous);
  });

  // So `u` right after a ship that worked does nothing visible: the board is already where the step
  // points, rather than being dragged back into the column the card was shipped from.
  it('leaves undo pointing at the board the card is already on', () => {
    const shipped = applyChange(start, moveCard(start.board, start.selection, 'right'));
    const back = applyAutomaticChange(shipped, moveCard(shipped.board, shipped.selection, 'left'));
    expect(titles(undoChange(back))).toEqual([['a'], []]);
  });

  it('hands back the same state when the operation did nothing', () => {
    expect(applyAutomaticChange(start, moveCard(start.board, start.selection, 'left'))).toBe(start);
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

  // The ship's move-back landing between `n` and Enter. Before this, the automatic change cleared the
  // flag, so Enter spent a step of its own and `u` left the just-named card sitting in the column
  // instead of putting back the board from before `n`.
  it('stays one step when an automatic change lands while the title box is open', () => {
    const start = state(board(['a'], []), { column: 1, card: 0 });
    const added = addBlankCard(start, 'new-id');
    // The selection stays on the card whose box is open; board-view.ts is what holds it there.
    const shipped = applyAutomaticChange(added, {
      board: renameCard(added.board, { column: 0, card: 0 }, 'a moved').board,
      selection: added.selection,
    });
    const named = commitTitle(shipped, 'Fix the resize race');
    expect(titles(named)).toEqual([['a moved'], ['Fix the resize race']]);
    const undone = undoChange(named);
    expect(undone.board.columns.flatMap((column) => column.cards.map((card) => card.title)))
      .not.toContain('Fix the resize race');
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

  // Blanking the title of a card with subtasks would orphan them, and unlike `d` there was never a
  // confirmation for it — so the keystroke costs nothing rather than stranding the family.
  it('keeps a card with subtasks when its title is blanked', () => {
    const withChild: Board = {
      columns: [{
        name: 'Column 0',
        cards: [
          { id: 'a', title: 'a', notes: '', priority: DEFAULT_PRIORITY, parent: null },
          { id: 'child', title: 'child', notes: '', priority: DEFAULT_PRIORITY, parent: 'a' },
        ],
      }],
    };
    const parentSelected = state(withChild, { column: 0, card: 0 });
    expect(commitTitle(parentSelected, '')).toBe(parentSelected);
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

describe('commitBranch', () => {
  const first = { column: 0, card: 0 };

  it('puts the branch on the card', () => {
    const next = commitBranch(state(board(['a']), first), '  fix-the-picker ');
    expect(next.board.columns[0].cards[0].branch).toBe('fix-the-picker');
  });

  // A card with no branch is an ordinary card, so an empty box clears it rather than refusing.
  it('clears the branch when the box is emptied', () => {
    const start = commitBranch(state(board(['a']), first), 'fix-the-picker');
    expect(commitBranch(start, '').board.columns[0].cards[0].branch).toBe(undefined);
  });

  // Opening a field and closing it unchanged must not spend the undo step belonging to the move you
  // made just before it.
  it('is not a change when the branch is what it already was', () => {
    const start = commitBranch(state(board(['a']), first), 'fix-the-picker');
    expect(commitBranch(start, ' fix-the-picker ')).toBe(start);
    // Identity, not equality: the point is that no undo step was spent, and a freshly built copy of
    // the same board would have spent one.
    const branchless = state(board(['a']), first);
    expect(commitBranch(branchless, '')).toBe(branchless);
  });
});

describe('commitPullRequest', () => {
  const first = { column: 0, card: 0 };

  it('reads a number written with or without the hash', () => {
    expect(commitPullRequest(state(board(['a']), first), '#14').board.columns[0].cards[0].pullRequest).toBe(14);
    expect(commitPullRequest(state(board(['a']), first), '14').board.columns[0].cards[0].pullRequest).toBe(14);
  });

  // The card keeps the number it had. board-view says so on the same condition.
  it('refuses anything that is not a pull request number', () => {
    const start = commitPullRequest(state(board(['a']), first), '14');
    expect(commitPullRequest(start, 'fourteen')).toBe(start);
    expect(start.board.columns[0].cards[0].pullRequest).toBe(14);
  });

  it('clears the number when the box is emptied', () => {
    const start = commitPullRequest(state(board(['a']), first), '14');
    expect(commitPullRequest(start, '  ').board.columns[0].cards[0].pullRequest).toBe(undefined);
  });

  it('is not a change when the number is what it already was', () => {
    const start = commitPullRequest(state(board(['a']), first), '14');
    expect(commitPullRequest(start, '#14')).toBe(start);
  });
});
