import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import {
  actsOnHiddenCard, cardMatches, keepingRow, rowAbove, rowsToDraw, emptyFilter, filterSummary, isFilterActive, realRow, reorderRow, settleSelection, stepSelection, visibleRows,
  type BoardFilter,
} from './board-filter';

const now = Date.parse('2026-10-06T12:00:00Z');
const daysAgo = (days: number): string => new Date(now - days * 86_400_000).toISOString();

function card(fields: Partial<Card>): Card {
  return { id: fields.title ?? 'x', title: 'x', notes: '', priority: 'medium', parent: null, ...fields };
}
function boardOf(...columns: Card[][]): Board {
  return { columns: columns.map((cards, index) => ({ name: `c${index}`, cards })) };
}
function filter(fields: Partial<BoardFilter>): BoardFilter {
  return { ...emptyFilter(), ...fields };
}
function matches(target: Card, fields: Partial<BoardFilter>, board: Board = boardOf([target])): boolean {
  return cardMatches(board, target, filter(fields), now);
}

describe('cardMatches', () => {
  it('matches everything with the empty filter', () => {
    expect(matches(card({}), {})).toBe(true);
    expect(isFilterActive(emptyFilter())).toBe(false);
  });

  it('finds text in the title, notes, comments and branch, ignoring case', () => {
    expect(matches(card({ title: 'Fix Resize' }), { text: 'resize' })).toBe(true);
    expect(matches(card({ notes: 'the resize race' }), { text: 'RESIZE' })).toBe(true);
    expect(matches(card({ comments: [{ body: 'resize again' }] }), { text: 'resize' })).toBe(true);
    expect(matches(card({ branch: 'fix-resize' }), { text: 'resize' })).toBe(true);
    expect(matches(card({ title: 'other' }), { text: 'resize' })).toBe(false);
  });

  it('treats a blank text as no text', () => {
    expect(isFilterActive(filter({ text: '   ' }))).toBe(false);
    expect(matches(card({}), { text: '   ' })).toBe(true);
  });

  it('keeps only the chosen priorities', () => {
    expect(matches(card({ priority: 'urgent' }), { priorities: ['urgent', 'high'] })).toBe(true);
    expect(matches(card({ priority: 'low' }), { priorities: ['urgent', 'high'] })).toBe(false);
  });

  it('tells top-level cards, subtasks and parents apart', () => {
    const parent = card({ id: 'p', title: 'p' });
    const child = card({ id: 'c', title: 'c', parent: 'p' });
    const board = boardOf([parent, child]);
    expect(matches(parent, { family: 'top-level' }, board)).toBe(true);
    expect(matches(child, { family: 'top-level' }, board)).toBe(false);
    expect(matches(child, { family: 'subtasks' }, board)).toBe(true);
    expect(matches(parent, { family: 'parents' }, board)).toBe(true);
    expect(matches(child, { family: 'parents' }, board)).toBe(false);
  });

  it('asks whether a branch, a pull request and comments are there', () => {
    expect(matches(card({ branch: 'b' }), { branch: 'has' })).toBe(true);
    expect(matches(card({}), { branch: 'has' })).toBe(false);
    expect(matches(card({}), { branch: 'none' })).toBe(true);
    expect(matches(card({ pullRequest: 4 }), { pullRequest: 'has' })).toBe(true);
    expect(matches(card({ pullRequest: 4 }), { pullRequest: 'none' })).toBe(false);
    expect(matches(card({ comments: [{ body: 'x' }] }), { comments: 'has' })).toBe(true);
    expect(matches(card({}), { comments: 'none' })).toBe(true);
  });

  it('measures created and updated against now', () => {
    expect(matches(card({ createdAt: daysAgo(0.5) }), { created: 'today' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(2) }), { created: 'today' })).toBe(false);
    expect(matches(card({ createdAt: daysAgo(6) }), { created: 'week' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(20) }), { created: 'month' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(40) }), { created: 'older' })).toBe(true);
    expect(matches(card({ createdAt: daysAgo(20) }), { created: 'older' })).toBe(false);
    expect(matches(card({ updatedAt: daysAgo(1.5) }), { updated: 'week' })).toBe(true);
  });

  it('never places a card with no timestamp on an age', () => {
    expect(matches(card({}), { created: 'older' })).toBe(false);
    expect(matches(card({}), { updated: 'today' })).toBe(false);
    expect(matches(card({}), { created: 'any' })).toBe(true);
  });

  it('needs every field to agree', () => {
    expect(matches(card({ priority: 'urgent', branch: 'b' }), { priorities: ['urgent'], branch: 'none' })).toBe(false);
  });
});

describe('visibleRows', () => {
  it('lists the real index of every matching card, per column', () => {
    const board = boardOf(
      [card({ id: 'a', priority: 'urgent' }), card({ id: 'b' }), card({ id: 'c', priority: 'urgent' })],
      [card({ id: 'd' })],
    );
    expect(visibleRows(board, filter({ priorities: ['urgent'] }), now)).toEqual([[0, 2], []]);
  });
});

describe('filterSummary', () => {
  it('names only the fields that are set', () => {
    expect(filterSummary(filter({ priorities: ['urgent', 'high'], branch: 'has', text: 'resize' })))
      .toBe('"resize" · urgent, high · has branch');
    expect(filterSummary(filter({ family: 'subtasks', created: 'week', comments: 'none' })))
      .toBe('subtasks · no comments · created in 7 days');
  });

  it('lists priorities in rank order whatever order they were picked in', () => {
    expect(filterSummary(filter({ priorities: ['low', 'urgent'] }))).toBe('urgent, low');
  });
});

// Column 0 shows real rows 1 and 3; column 1 shows 0, 2 and 4; column 2 shows nothing.
const visible = [[1, 3], [0, 2, 4], []];

describe('settleSelection', () => {
  it('leaves a visible selection alone', () => {
    const selection = { column: 0, card: 3 };
    expect(settleSelection(visible, selection)).toBe(selection);
  });
  it('moves a hidden selection to the first visible card of its column', () => {
    expect(settleSelection(visible, { column: 0, card: 2 })).toEqual({ column: 0, card: 1 });
  });
  it('rests on row 0 in a column with nothing visible', () => {
    expect(settleSelection(visible, { column: 2, card: 5 })).toEqual({ column: 2, card: 0 });
  });
  it('hands back the same selection when it is already resting there', () => {
    const selection = { column: 2, card: 0 };
    expect(settleSelection(visible, selection)).toBe(selection);
  });
});

describe('stepSelection', () => {
  it('walks up and down over visible rows only, stopping at the ends', () => {
    expect(stepSelection(visible, { column: 0, card: 1 }, 'down')).toEqual({ column: 0, card: 3 });
    expect(stepSelection(visible, { column: 0, card: 3 }, 'down')).toEqual({ column: 0, card: 3 });
    expect(stepSelection(visible, { column: 0, card: 1 }, 'up')).toEqual({ column: 0, card: 1 });
  });
  it('keeps its place among visible rows across columns', () => {
    expect(stepSelection(visible, { column: 0, card: 3 }, 'right')).toEqual({ column: 1, card: 2 });
    expect(stepSelection(visible, { column: 1, card: 4 }, 'left')).toEqual({ column: 0, card: 3 });
  });
  it('lands on row 0 of a column with nothing visible, and walks on out of it', () => {
    expect(stepSelection(visible, { column: 1, card: 2 }, 'right')).toEqual({ column: 2, card: 0 });
    expect(stepSelection(visible, { column: 2, card: 0 }, 'left')).toEqual({ column: 1, card: 0 });
  });
  it('stays put going up or down in a column with nothing visible', () => {
    expect(stepSelection(visible, { column: 2, card: 0 }, 'down')).toEqual({ column: 2, card: 0 });
  });
  it('stops at the outer columns', () => {
    expect(stepSelection(visible, { column: 0, card: 1 }, 'left')).toEqual({ column: 0, card: 1 });
  });
});

describe('reorderRow', () => {
  it('swaps past hidden cards with the visible neighbour', () => {
    expect(reorderRow(visible, { column: 0, card: 3 }, 'up')).toBe(1);
    expect(reorderRow(visible, { column: 0, card: 1 }, 'down')).toBe(4);
  });
  it('has nothing to swap with at the ends', () => {
    expect(reorderRow(visible, { column: 0, card: 1 }, 'up')).toBeNull();
    expect(reorderRow(visible, { column: 0, card: 3 }, 'down')).toBeNull();
  });
  it('moves nothing when the selected card is itself hidden', () => {
    expect(reorderRow(visible, { column: 0, card: 2 }, 'down')).toBeNull();
  });
});

describe('realRow', () => {
  it('drops before the visible card at that row', () => {
    expect(realRow(visible, 1, 1, 6)).toBe(2);
  });
  it('drops right after the last visible card when aimed past it', () => {
    expect(realRow(visible, 1, 3, 6)).toBe(5);
  });
  it('drops at the end of a column with nothing visible', () => {
    expect(realRow(visible, 2, 0, 7)).toBe(7);
  });
});

describe('actsOnHiddenCard', () => {
  const board = boardOf([card({ id: 'a' }), card({ id: 'b' })], []);
  const shown = [[1], []];

  it('refuses a card key while the selection sits on a card the filter hides', () => {
    expect(actsOnHiddenCard(board, shown, { column: 0, card: 0 }, 'board-delete')).toBe(true);
    expect(actsOnHiddenCard(board, shown, { column: 0, card: 0 }, 'board-edit')).toBe(true);
    expect(actsOnHiddenCard(board, shown, { column: 0, card: 0 }, 'board-move')).toBe(true);
  });

  it('lets a card key through on a card you can see', () => {
    expect(actsOnHiddenCard(board, shown, { column: 0, card: 1 }, 'board-delete')).toBe(false);
  });

  it('lets through the keys that are not about the selected card', () => {
    for (const kind of ['board-select', 'board-add', 'board-sort', 'board-search', 'board-undo', 'board-filter'] as const) {
      expect(actsOnHiddenCard(board, shown, { column: 0, card: 0 }, kind)).toBe(false);
    }
  });

  it('has nothing to refuse in an empty column', () => {
    expect(actsOnHiddenCard(board, shown, { column: 1, card: 0 }, 'board-delete')).toBe(false);
  });
});

describe('keepingRow', () => {
  it('puts the selected card back among the rows, in board order', () => {
    expect(keepingRow(visible, { column: 0, card: 2 })).toEqual([[1, 2, 3], [0, 2, 4], []]);
  });
  it('hands back the same rows when the card is already shown', () => {
    expect(keepingRow(visible, { column: 0, card: 1 })).toBe(visible);
  });
});

describe('rowsToDraw', () => {
  it('keeps a hidden selected card on screen while a box is open on it', () => {
    const selection = { column: 0, card: 2 };
    const drawn = rowsToDraw(visible, selection, true);
    expect(drawn.selection).toBe(selection);
    expect(drawn.visible[0]).toEqual([1, 2, 3]);
  });

  it('settles a hidden selection when nothing is being typed', () => {
    expect(rowsToDraw(visible, { column: 0, card: 2 }, false))
      .toEqual({ visible, selection: { column: 0, card: 1 } });
  });

  it('keeps the new card a filter would hide, on a column the filter empties', () => {
    const selection = { column: 2, card: 3 };
    expect(rowsToDraw(visible, selection, true).visible[2]).toEqual([3]);
  });
});

describe('rowAbove', () => {
  it('is the visible card above, skipping hidden ones', () => {
    expect(rowAbove(visible, { column: 1, card: 4 })).toBe(2);
  });
  it('is -1 on the top visible card', () => {
    expect(rowAbove(visible, { column: 1, card: 0 })).toBe(-1);
  });
  it('is -1 when the selected card is itself hidden', () => {
    expect(rowAbove(visible, { column: 0, card: 2 })).toBe(-1);
  });
});
