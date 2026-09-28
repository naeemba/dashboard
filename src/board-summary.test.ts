import { describe, expect, it } from 'vitest';
import type { Board, Card } from './board';
import { columnCounts, recentActivity } from './board-summary';

const card = (id: string, fields: Partial<Card> = {}): Card => ({
  id, title: id, notes: '', priority: 'medium', parent: null, ...fields,
});

const board = (columns: Record<string, Card[]>): Board => ({
  columns: Object.entries(columns).map(([name, cards]) => ({ name, cards })),
});

describe('columnCounts', () => {
  it('counts each column that has something in it, in the board order', () => {
    const counted = columnCounts(board({ Todo: [card('a'), card('b')], Doing: [], Review: [card('c')] }));
    expect(counted).toEqual([{ name: 'Todo', count: 2 }, { name: 'Review', count: 1 }]);
  });

  // Done only grows. Counting it would put the widest figure on every row about work nobody is doing.
  it('leaves Done out, whatever case it is written in', () => {
    expect(columnCounts(board({ Doing: [card('a')], done: [card('b'), card('c')] })))
      .toEqual([{ name: 'Doing', count: 1 }]);
  });

  it('counts a card split into subtasks as one piece of work', () => {
    const counted = columnCounts(board({ Todo: [card('a'), card('b', { parent: 'a' }), card('c', { parent: 'a' })] }));
    expect(counted).toEqual([{ name: 'Todo', count: 1 }]);
  });
});

describe('recentActivity', () => {
  it('lists the cards touched last across every project, newest first', () => {
    const api = board({ Todo: [card('old', { updatedAt: '2026-09-01T10:00:00Z' })] });
    const web = board({ Doing: [card('new', { updatedAt: '2026-09-03T10:00:00Z' })] });
    const entries = recentActivity([{ project: 'api', board: api }, { project: 'web', board: web }]);
    expect(entries.map((entry) => [entry.project, entry.id, entry.column])).toEqual([
      ['web', 'new', 'Doing'], ['api', 'old', 'Todo'],
    ]);
  });

  // An old card has no stamp. Putting it anywhere on a newest-first list would be a guess.
  it('leaves off a card that does not know when it last changed', () => {
    const entries = recentActivity([{ project: 'api', board: board({ Todo: [card('a'), card('b', { updatedAt: 'soon' })] }) }]);
    expect(entries).toEqual([]);
  });

  it('stops at the limit', () => {
    const cards = ['a', 'b', 'c'].map((id, index) => card(id, { updatedAt: `2026-09-0${index + 1}T00:00:00Z` }));
    expect(recentActivity([{ project: 'api', board: board({ Todo: cards }) }], 2).map((entry) => entry.id))
      .toEqual(['c', 'b']);
  });
});
