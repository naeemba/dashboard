import { describe, expect, it } from 'vitest';
import { addCard, deleteCard, emptyBoard, moveCard, moveSelection, renameCard, type Board } from './board';

function board(...columns: string[][]): Board {
  return {
    columns: columns.map((titles, index) => ({
      name: `Column ${index}`,
      cards: titles.map((title) => ({ id: title, title, notes: '' })),
    })),
  };
}

function titles(result: Board): string[][] {
  return result.columns.map((column) => column.cards.map((card) => card.title));
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

describe('renameCard', () => {
  it('replaces the title and keeps the id and notes', () => {
    const start: Board = { columns: [{ name: 'Todo', cards: [{ id: 'x', title: 'old', notes: 'why' }] }] };
    const result = renameCard(start, { column: 0, card: 0 }, 'new');
    expect(result.board.columns[0].cards[0]).toEqual({ id: 'x', title: 'new', notes: 'why' });
  });

  it('does nothing on an empty column', () => {
    const start = board([]);
    expect(renameCard(start, { column: 0, card: 0 }, 'new').board).toEqual(start);
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

  it('does nothing on an empty column', () => {
    const start = board([]);
    expect(deleteCard(start, { column: 0, card: 0 })).toEqual({ board: start, selection: { column: 0, card: 0 } });
  });
});

describe('moveCard', () => {
  it('swaps with the card above or below', () => {
    const result = moveCard(board(['a', 'b', 'c']), { column: 0, card: 2 }, 'up');
    expect(titles(result.board)).toEqual([['a', 'c', 'b']]);
    expect(result.selection).toEqual({ column: 0, card: 1 });
  });

  it('stays put at the top and the bottom', () => {
    const start = board(['a', 'b']);
    expect(moveCard(start, { column: 0, card: 0 }, 'up')).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(moveCard(start, { column: 0, card: 1 }, 'down'))
      .toEqual({ board: start, selection: { column: 0, card: 1 } });
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

  it('stays put at the outer columns', () => {
    const start = board(['a'], ['b']);
    expect(moveCard(start, { column: 0, card: 0 }, 'left')).toEqual({ board: start, selection: { column: 0, card: 0 } });
    expect(moveCard(start, { column: 1, card: 0 }, 'right'))
      .toEqual({ board: start, selection: { column: 1, card: 0 } });
  });

  it('does nothing on an empty column', () => {
    const start = board([], ['a']);
    expect(moveCard(start, { column: 0, card: 0 }, 'right')).toEqual({ board: start, selection: { column: 0, card: 0 } });
  });
});
