import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKLOG_COLUMN,
  REVIEW_COLUMN,
  SHIP_COLUMN,
  addCard,
  addComment,
  cardById,
  cyclePriority,
  deleteCard,
  emptyBoard,
  isCommentBody,
  moveCard,
  moveSelection,
  pullRequestFrom,
  renameCard,
  selectionOf,
  setNotes,
  sortColumn,
  type Board,
  type Priority,
} from './board';
import { board, titles } from './test-board';

describe('emptyBoard', () => {
  it('opens with six empty columns', () => {
    expect(emptyBoard().columns.map((column) => column.name))
      .toEqual([BACKLOG_COLUMN, 'Todo', SHIP_COLUMN, 'Doing', REVIEW_COLUMN, 'Done']);
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

  // Trimmed here, not by whoever called. A caller that forgets would leave one card sitting a space
  // in from every other card on the board, and nothing would fail.
  it('trims the title', () => {
    const result = addCard(board([]), { column: 0, card: 0 }, 'new', '  Ship it  ');
    expect(titles(result.board)).toEqual([['Ship it']]);
  });
});

describe('renameCard', () => {
  it('replaces the title and keeps the id and notes', () => {
    const start: Board = {
      columns: [{ name: 'Todo', cards: [{ id: 'x', title: 'old', notes: 'why', priority: 'high', parent: null }] }],
    };
    const result = renameCard(start, { column: 0, card: 0 }, 'new');
    expect(result.board.columns[0].cards[0])
      .toEqual({ id: 'x', title: 'new', notes: 'why', priority: 'high', parent: null, updatedAt: expect.any(String) });
  });

  it('trims the title, the same as addCard', () => {
    const result = renameCard(board(['old']), { column: 0, card: 0 }, '  Ship it  ');
    expect(titles(result.board)).toEqual([['Ship it']]);
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
      .toEqual({ id: 'x', title: 't', notes: 'new', priority: 'low', parent: null, updatedAt: expect.any(String) });
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

describe('cardById', () => {
  it('finds a card in any column', () => {
    expect(cardById(board(['a'], ['b']), 'b')?.title).toBe('b');
  });

  it('is undefined for an id no card has', () => {
    expect(cardById(board(['a']), 'z')).toBeUndefined();
  });
});

describe('selectionOf', () => {
  it('gives the column and row a card sits at', () => {
    expect(selectionOf(board(['a'], ['b', 'c']), 'c')).toEqual({ column: 1, card: 1 });
  });

  // board-detail.ts falls back to the card you opened on this, so null is the half that matters.
  it('is null for an id no card has', () => {
    expect(selectionOf(board(['a']), 'z')).toBe(null);
  });
});

describe('card timestamps', () => {
  const first = { column: 0, card: 0 };
  const january = '2026-01-01T00:00:00.000Z';
  const march = '2026-03-01T00:00:00.000Z';

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function madeInJanuary(): Board {
    vi.setSystemTime(new Date(january));
    return addCard(board([]), first, 'x', 'Ship it').board;
  }

  it('stamps a new card with when it was written', () => {
    const card = madeInJanuary().columns[0].cards[0];
    expect(card.createdAt).toBe(january);
    expect(card.updatedAt).toBe(january);
  });

  it('ages a card whose own field changed, and leaves createdAt where it was', () => {
    const start = madeInJanuary();
    vi.setSystemTime(new Date(march));
    const card = setNotes(start, first, 'why').board.columns[0].cards[0];
    expect(card.createdAt).toBe(january);
    expect(card.updatedAt).toBe(march);
  });

  // The whole file is rewritten on every edit. If this fails, every card on the board carries the
  // moment you renamed one of them, which is the same as having no timestamps at all.
  it('ages only the card that changed', () => {
    const start = board(['a', 'b']);
    const cards = renameCard(start, first, 'new').board.columns[0].cards;
    expect(cards[0].updatedAt).toEqual(expect.any(String));
    expect(cards[1].updatedAt).toBe(undefined);
  });

  it('ages a card that moves to another column', () => {
    vi.setSystemTime(new Date(march));
    const moved = moveCard(board(['a'], []), first, 'right').board;
    expect(moved.columns[1].cards[0].updatedAt).toBe(march);
  });

  // Reordering a list is not touching the work.
  it('does not age a card moved up or down its own column', () => {
    const moved = moveCard(board(['a', 'b']), first, 'down').board;
    expect(moved.columns[0].cards.map((card) => card.updatedAt)).toEqual([undefined, undefined]);
  });
});

describe('pullRequestFrom', () => {
  it('reads a number written with or without the hash', () => {
    expect(pullRequestFrom('14')).toBe(14);
    expect(pullRequestFrom('#14')).toBe(14);
    expect(pullRequestFrom('  #14 ')).toBe(14);
  });

  it('refuses anything that is not a pull request number', () => {
    for (const text of ['', 'fourteen', '0', '-3', '1.5', '#', 'PR 14', '0x10', '1e3', '0b1010']) {
      expect(pullRequestFrom(text)).toBe(null);
    }
  });
});

describe('addComment', () => {
  const first = { column: 0, card: 0 };

  it('starts the trail on a card that has none', () => {
    const commented = addComment(board(['Ship it']), first, 'The race is in the debounce.');
    expect(commented.board.columns[0].cards[0].comments)
      .toEqual([{ at: expect.any(String), body: 'The race is in the debounce.' }]);
  });

  // The whole point of the field: an agent recording what it found must not be able to take out what
  // somebody typed by hand, the way `set --notes` does.
  it('appends, oldest first, and leaves what is there alone', () => {
    const once = addComment(board(['Ship it']), first, 'first');
    const twice = addComment(once.board, first, 'second');
    expect(twice.board.columns[0].cards[0].comments?.map((comment) => comment.body)).toEqual(['first', 'second']);
  });

  it('trims what it is given', () => {
    const commented = addComment(board(['Ship it']), first, '  padded\n');
    expect(commented.board.columns[0].cards[0].comments?.[0].body).toBe('padded');
  });

  // The same board back, which is what keeps a blank box out of the undo step and off the disk.
  it('adds nothing for a blank body', () => {
    const start = board(['Ship it']);
    expect(addComment(start, first, '   ').board).toBe(start);
  });

  it('adds nothing when there is no card to comment on', () => {
    const start = board([]);
    expect(addComment(start, first, 'anything').board).toBe(start);
  });

  it('ages the card, the way every other field change does', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    const commented = addComment(board(['Ship it']), first, 'found it');
    expect(commented.board.columns[0].cards[0].updatedAt).toBe('2026-03-01T00:00:00.000Z');
    vi.useRealTimers();
  });
});

describe('isCommentBody', () => {
  it('takes any text with something in it and refuses the rest', () => {
    expect(isCommentBody('found it')).toBe(true);
    expect(isCommentBody('two\nlines')).toBe(true);
    for (const value of ['', '   ', '\n', undefined, null, 3, {}]) expect(isCommentBody(value)).toBe(false);
  });
});
