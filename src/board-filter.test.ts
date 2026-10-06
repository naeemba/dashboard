import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import { cardMatches, emptyFilter, filterSummary, isFilterActive, visibleRows, type BoardFilter } from './board-filter';

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
