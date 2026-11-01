import { describe, expect, it } from 'vitest';
import {
  addChildCard,
  attachToCardAbove,
  attachmentRing,
  childColumns,
  childrenOf,
  deleteCardAndDescendants,
  descendantsOf,
  detachCard,
  hasSubtasks,
  isDescendantOf,
  type Board,
} from './board';
import { board, titles } from './test-board';

// The test boards use the title as the id, so a relation reads as "b's parent is a".
function withParents(source: Board, parents: Record<string, string>): Board {
  return {
    columns: source.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card, parent: parents[card.id] ?? null })),
    })),
  };
}

function parents(result: Board): Record<string, string | null> {
  return Object.fromEntries(result.columns.flatMap((column) => column.cards.map((card) => [card.id, card.parent])));
}

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

  it('trims the title, the same as addCard', () => {
    const result = addChildCard(board(['a']), { column: 0, card: 0 }, 'new', '  a subtask  ');
    expect(titles(result.board)).toEqual([['a', 'a subtask']]);
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
  // Under a filter the card above on screen is not the card above in the column.
  it('attaches to the row it is given rather than the one directly above', () => {
    const result = attachToCardAbove(board(['a', 'hidden', 'b']), { column: 0, card: 2 }, 0);
    expect(parents(result.board).b).toBe('a');
  });

  it('does nothing when the row it is given holds no card', () => {
    const start = board(['a', 'b']);
    expect(attachToCardAbove(start, { column: 0, card: 1 }, -1).board).toBe(start);
  });

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

  // The no-op that costs something if it goes: rebuilding the board here would spend the undo step
  // on a board identical to the one on screen, and `u` would no longer reach the move before it.
  it('does nothing when the card above is already the parent', () => {
    const start = withParents(board(['a', 'b']), { b: 'a' });
    expect(attachToCardAbove(start, { column: 0, card: 1 }).board).toBe(start);
  });
});

describe('attachmentRing', () => {
  it('asks about the row it is given, the same row the attachment would use', () => {
    const start = withParents(board(['b', 'hidden', 'a']), { b: 'a' });
    expect(attachmentRing(start, { column: 0, card: 2 }, 0)?.title).toBe('b');
    expect(attachmentRing(start, { column: 0, card: 2 })).toBe(null);
  });

  // a is b's parent, and b sits above a: attaching a to b would make each the other's ancestor.
  it('names the card above when attaching would make a ring', () => {
    const start = withParents(board(['b', 'a']), { b: 'a' });
    expect(attachmentRing(start, { column: 0, card: 1 })?.title).toBe('b');
  });

  it('is null when the attachment would go through', () => {
    expect(attachmentRing(board(['a', 'b']), { column: 0, card: 1 })).toBe(null);
  });

  it('is null on the top card of a column', () => {
    expect(attachmentRing(board(['a', 'b']), { column: 0, card: 0 })).toBe(null);
  });
});

describe('hasSubtasks', () => {
  it('is true for a card something points at', () => {
    const start = withParents(board(['a'], ['b']), { b: 'a' });
    expect(hasSubtasks(start, { column: 0, card: 0 })).toBe(true);
  });

  it('is false for a leaf card and for an empty column', () => {
    expect(hasSubtasks(board(['a', 'b']), { column: 0, card: 1 })).toBe(false);
    expect(hasSubtasks(board(['a'], []), { column: 1, card: 0 })).toBe(false);
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
