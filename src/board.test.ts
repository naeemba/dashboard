import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITY,
  addCard,
  addChildCard,
  attachToCardAbove,
  childColumns,
  childrenOf,
  cyclePriority,
  deleteCard,
  deleteCardAndDescendants,
  descendantsOf,
  detachCard,
  emptyBoard,
  isDescendantOf,
  moveCard,
  moveSelection,
  renameCard,
  setNotes,
  sortColumn,
  type Board,
  type Priority,
} from './board';

function board(...columns: string[][]): Board {
  return {
    columns: columns.map((titles, index) => ({
      name: `Column ${index}`,
      cards: titles.map((title) => ({ id: title, title, notes: '', priority: DEFAULT_PRIORITY, parent: null })),
    })),
  };
}

// The test boards use the title as the id, so a relation reads as "b's parent is a".
function withParents(source: Board, parents: Record<string, string>): Board {
  return {
    columns: source.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card, parent: parents[card.id] ?? null })),
    })),
  };
}

function titles(result: Board): string[][] {
  return result.columns.map((column) => column.cards.map((card) => card.title));
}

function parents(result: Board): Record<string, string | null> {
  return Object.fromEntries(result.columns.flatMap((column) => column.cards.map((card) => [card.id, card.parent])));
}

describe('emptyBoard', () => {
  it('opens with three empty columns', () => {
    expect(emptyBoard().columns.map((column) => column.name)).toEqual(['Todo', 'Doing', 'Done']);
    expect(emptyBoard().columns.every((column) => column.cards.length === 0)).toBe(true);
  });
});

describe('moveSelection', () => {
  const three = board(['a', 'b'], ['c'], []);

  it('walks cards within a column and stops at the ends', () => {
    expect(moveSelection(three, { column: 0, card: 0 }, 'down')).toEqual({ column: 0, card: 1 });
    expect(moveSelection(three, { column: 0, card: 1 }, 'down')).toEqual({ column: 0, card: 1 });
    expect(moveSelection(three, { column: 0, card: 0 }, 'up')).toEqual({ column: 0, card: 0 });
  });

  it('walks columns and stops at the edges', () => {
    expect(moveSelection(three, { column: 0, card: 0 }, 'right')).toEqual({ column: 1, card: 0 });
    expect(moveSelection(three, { column: 2, card: 0 }, 'right')).toEqual({ column: 2, card: 0 });
    expect(moveSelection(three, { column: 0, card: 0 }, 'left')).toEqual({ column: 0, card: 0 });
  });

  // Moving from the second card of a full column into a shorter one must land on a card that exists.
  it('clamps the row when the next column is shorter', () => {
    expect(moveSelection(three, { column: 0, card: 1 }, 'right')).toEqual({ column: 1, card: 0 });
  });

  it('sits at row zero of an empty column', () => {
    expect(moveSelection(three, { column: 1, card: 0 }, 'right')).toEqual({ column: 2, card: 0 });
  });
});

describe('addCard', () => {
  it('adds at the bottom of the column and selects it', () => {
    const result = addCard(board(['a'], []), { column: 0, card: 0 }, 'new', 'b');
    expect(titles(result.board)).toEqual([['a', 'b'], []]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('leaves the board it was given alone', () => {
    const original = board(['a']);
    addCard(original, { column: 0, card: 0 }, 'new', 'b');
    expect(titles(original)).toEqual([['a']]);
  });
});

describe('addChildCard', () => {
  it('adds the card to the parent\'s column, at the bottom, pointing at the parent', () => {
    const result = addChildCard(board(['a'], ['x']), { column: 0, card: 0 }, 'new', 'a subtask');
    expect(titles(result.board)).toEqual([['a', 'a subtask'], ['x']]);
    expect(parents(result.board)['new']).toBe('a');
  });

  it('selects the card it added', () => {
    const result = addChildCard(board(['a']), { column: 0, card: 0 }, 'new', 'a subtask');
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(addChildCard(start, { column: 1, card: 0 }, 'new', 'a subtask').board).toBe(start);
  });

  it('leaves the board it was given alone', () => {
    const original = board(['a']);
    addChildCard(original, { column: 0, card: 0 }, 'new', 'a subtask');
    expect(titles(original)).toEqual([['a']]);
  });
});

describe('renameCard', () => {
  it('replaces the title and keeps the id and notes', () => {
    const start: Board = {
      columns: [{ name: 'Todo', cards: [{ id: 'x', title: 'old', notes: 'why', priority: 'high', parent: null }] }],
    };
    const result = renameCard(start, { column: 0, card: 0 }, 'new');
    expect(result.board.columns[0].cards[0]).toEqual({ id: 'x', title: 'new', notes: 'why', priority: 'high', parent: null });
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([]);
    // The board-view undo step depends on a no-op returning the identical object, not just an
    // equal one, so it can tell "nothing happened" from "happened to end up the same".
    expect(renameCard(start, { column: 0, card: 0 }, 'new').board).toBe(start);
  });
});

describe('deleteCard', () => {
  it('removes the card and selects the one that takes its place', () => {
    const result = deleteCard(board(['a', 'b', 'c']), { column: 0, card: 1 });
    expect(titles(result.board)).toEqual([['a', 'c']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('steps back when the last card goes', () => {
    const result = deleteCard(board(['a', 'b']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 0 });
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([]);
    const result = deleteCard(start, { column: 0, card: 0 });
    expect(result).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(result.board).toBe(start);
  });
});

describe('deleteCardAndDescendants', () => {
  it('takes children in other columns with it', () => {
    const start = withParents(board(['a', 'z'], ['b'], ['c']), { b: 'a', c: 'b' });
    const result = deleteCardAndDescendants(start, { column: 0, card: 0 });
    expect(titles(result.board)).toEqual([['z'], [], []]);
  });

  it('leaves a sibling alone', () => {
    const start = withParents(board(['a', 'b'], ['c']), { c: 'a' });
    const result = deleteCardAndDescendants(start, { column: 0, card: 1 });
    expect(titles(result.board)).toEqual([['a'], ['c']]);
  });

  it('leaves the parent of the deleted card alone', () => {
    const start = withParents(board(['a', 'b']), { b: 'a' });
    expect(titles(deleteCardAndDescendants(start, { column: 0, card: 1 }).board)).toEqual([['a']]);
  });

  it('puts the selection on the card that took its place', () => {
    const result = deleteCardAndDescendants(board(['a', 'b', 'c']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('clamps the selection when the last card of a column goes', () => {
    const result = deleteCardAndDescendants(board(['a', 'b']), { column: 0, card: 1 });
    expect(result.selection).toEqual({ column: 0, card: 0 });
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(deleteCardAndDescendants(start, { column: 1, card: 0 }).board).toBe(start);
  });

  // A child can sit above its parent once someone has reordered the column. Both go, so every
  // surviving row below shifts up — and the cursor has to shift with them.
  it('lands on the card that took the deleted card\'s place, even when a subtask above it went too', () => {
    const start = withParents(board(['child', 'parent', 'other', 'other2']), { child: 'parent' });
    const result = deleteCardAndDescendants(start, { column: 0, card: 1 });
    expect(titles(result.board)).toEqual([['other', 'other2']]);
    expect(result.selection).toEqual({ column: 0, card: 0 });
  });
});

describe('moveCard', () => {
  it('swaps with the card above or below', () => {
    const result = moveCard(board(['a', 'b', 'c']), { column: 0, card: 2 }, 'up');
    expect(titles(result.board)).toEqual([['a', 'c', 'b']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('stays put at the top and the bottom, and hands back the same board', () => {
    const start = board(['a', 'b']);
    const up = moveCard(start, { column: 0, card: 0 }, 'up');
    expect(up).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(up.board).toBe(start);
    const down = moveCard(start, { column: 0, card: 1 }, 'down');
    expect(down).toEqual({ board: start, selection: { column: 0, card: 1 } });
    expect(down.board).toBe(start);
  });

  // A card sent sideways keeps its row rather than dropping to the bottom of the next column.
  it('sends a card to the next column at the same row', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x', 'y', 'z']), { column: 0, card: 1 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'c'], ['x', 'b', 'y', 'z']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('lands at the end when the next column is shorter', () => {
    const result = moveCard(board(['a', 'b', 'c'], ['x']), { column: 0, card: 2 }, 'right');
    expect(titles(result.board)).toEqual([['a', 'b'], ['x', 'c']]);
    expect(result.selection).toEqual({ column: 1, card: 1 });
  });

  it('stays put at the outer columns, and hands back the same board', () => {
    const start = board(['a'], ['b']);
    const left = moveCard(start, { column: 0, card: 0 }, 'left');
    expect(left).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(left.board).toBe(start);
    const right = moveCard(start, { column: 1, card: 0 }, 'right');
    expect(right).toEqual({ board: start, selection: { column: 1, card: 0 } });
    expect(right.board).toBe(start);
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([], ['a']);
    const result = moveCard(start, { column: 0, card: 0 }, 'right');
    expect(result).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(result.board).toBe(start);
  });
});

// Cards named by their priority, so a sorted column reads as its own expectation.
function priorityBoard(...priorities: Priority[]): Board {
  return {
    columns: [{
      name: 'Todo',
      cards: priorities.map((priority, index) => ({ id: `${index}`, title: `${index}`, notes: '', priority, parent: null })),
    }],
  };
}

const order = (result: Board): Priority[] => result.columns[0].cards.map((card) => card.priority);

describe('cyclePriority', () => {
  it('walks all four and wraps back to the top', () => {
    let cycled = priorityBoard('urgent');
    const seen: string[] = [];
    for (let step = 0; step < 4; step++) {
      cycled = cyclePriority(cycled, { column: 0, card: 0 }).board;
      seen.push(cycled.columns[0].cards[0].priority);
    }
    expect(seen).toEqual(['high', 'medium', 'low', 'urgent']);
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([]);
    expect(cyclePriority(start, { column: 0, card: 0 }).board).toBe(start);
  });
});

describe('setNotes', () => {
  it('replaces the notes and leaves everything else alone', () => {
    const start: Board = {
      columns: [{ name: 'Todo', cards: [{ id: 'x', title: 't', notes: 'old', priority: 'low', parent: null }] }],
    };
    expect(setNotes(start, { column: 0, card: 0 }, 'new').board.columns[0].cards[0])
      .toEqual({ id: 'x', title: 't', notes: 'new', priority: 'low', parent: null });
  });
});

describe('sortColumn', () => {
  it('puts urgent first and low last', () => {
    const result = sortColumn(priorityBoard('low', 'urgent', 'medium', 'high'), { column: 0, card: 0 });
    expect(order(result.board)).toEqual(['urgent', 'high', 'medium', 'low']);
  });

  // Shift+up and Shift+down are the only way to order cards within a priority, so a sort must not
  // undo that work.
  it('keeps the order you put equal cards in', () => {
    const start = priorityBoard('high', 'high', 'urgent');
    const result = sortColumn(start, { column: 0, card: 0 });
    expect(result.board.columns[0].cards.map((card) => card.id)).toEqual(['2', '0', '1']);
  });

  it('follows the selected card to its new row', () => {
    // Row 0 is the only low card, and sorting sends it to the bottom.
    const result = sortColumn(priorityBoard('low', 'urgent', 'high'), { column: 0, card: 0 });
    expect(result.selection).toEqual({ column: 0, card: 2 });
  });

  it('hands back the same board when the column is already in order', () => {
    const start = priorityBoard('urgent', 'high', 'low');
    expect(sortColumn(start, { column: 0, card: 0 }).board).toBe(start);
  });

  it('does nothing on an empty column, and hands back the same board', () => {
    const start = board([]);
    expect(sortColumn(start, { column: 0, card: 0 }).board).toBe(start);
  });
});

describe('childrenOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('finds the cards that name a card as their parent', () => {
    expect(childrenOf(family, 'a').map((card) => card.title)).toEqual(['b', 'c']);
  });

  it('reads children across columns, left to right then top to bottom', () => {
    const spread = withParents(board(['a', 'x'], ['y'], ['z']), { x: 'a', y: 'a', z: 'a' });
    expect(childrenOf(spread, 'a').map((card) => card.title)).toEqual(['x', 'y', 'z']);
  });

  it('is empty for a card nobody points at', () => {
    expect(childrenOf(family, 'd')).toEqual([]);
  });
});

describe('descendantsOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('goes all the way down, not just one level', () => {
    expect(descendantsOf(family, 'a').map((card) => card.title)).toEqual(['b', 'c', 'd']);
  });

  it('leaves the card itself out', () => {
    expect(descendantsOf(family, 'a').some((card) => card.id === 'a')).toBe(false);
  });
});

describe('isDescendantOf', () => {
  const family = withParents(board(['a', 'b'], ['c'], ['d']), { b: 'a', c: 'a', d: 'c' });

  it('is true for a grandchild', () => {
    expect(isDescendantOf(family, 'd', 'a')).toBe(true);
  });

  it('is false the other way round', () => {
    expect(isDescendantOf(family, 'a', 'd')).toBe(false);
  });

  it('is false for a card and itself', () => {
    expect(isDescendantOf(family, 'a', 'a')).toBe(false);
  });
});

describe('childColumns', () => {
  it('says which column each child sits in, in the order children are read', () => {
    const spread = withParents(board(['a', 'x'], ['y'], ['z']), { x: 'a', y: 'a', z: 'a' });
    expect(childColumns(spread, 'a')).toEqual([0, 1, 2]);
  });

  it('is empty for a card with no children', () => {
    expect(childColumns(board(['a']), 'a')).toEqual([]);
  });
});

describe('attachToCardAbove', () => {
  it('makes the selected card a child of the card directly above it', () => {
    const result = attachToCardAbove(board(['a', 'b']), { column: 0, card: 1 });
    expect(parents(result.board).b).toBe('a');
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('does nothing on the top card of a column', () => {
    const start = board(['a', 'b']);
    expect(attachToCardAbove(start, { column: 0, card: 0 }).board).toBe(start);
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(attachToCardAbove(start, { column: 1, card: 0 }).board).toBe(start);
  });

  // a is b's parent, and b sits above a. Attaching a to b would make each the other's ancestor, and
  // descendantsOf would then never finish.
  it('refuses to attach a card to its own descendant', () => {
    const start = withParents(board(['b', 'a']), { b: 'a' });
    expect(attachToCardAbove(start, { column: 0, card: 1 }).board).toBe(start);
  });

  it('moves a card that already has a parent to the new one', () => {
    const start = withParents(board(['a', 'b', 'c']), { c: 'a' });
    expect(parents(attachToCardAbove(start, { column: 0, card: 2 }).board).c).toBe('b');
  });
});

describe('detachCard', () => {
  it('clears the parent and leaves the card where it is', () => {
    const start = withParents(board(['a', 'b']), { b: 'a' });
    const result = detachCard(start, { column: 0, card: 1 });
    expect(parents(result.board).b).toBe(null);
    expect(titles(result.board)).toEqual([['a', 'b']]);
  });

  it('does nothing to a card that has no parent', () => {
    const start = board(['a', 'b']);
    expect(detachCard(start, { column: 0, card: 1 }).board).toBe(start);
  });

  it('does nothing in an empty column', () => {
    const start = board(['a'], []);
    expect(detachCard(start, { column: 1, card: 0 }).board).toBe(start);
  });

  // The children of a detached card follow it: they point at its id, which has not changed.
  it('leaves the detached card its own children', () => {
    const start = withParents(board(['a', 'b', 'c']), { b: 'a', c: 'b' });
    expect(parents(detachCard(start, { column: 0, card: 1 }).board).c).toBe('b');
  });
});
