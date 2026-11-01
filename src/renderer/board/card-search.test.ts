import { describe, expect, it } from 'vitest';
import { cardRows } from './card-search';
import { DEFAULT_PRIORITY, type Board, type Card } from './board';

const card = (title: string, fields: Partial<Card> = {}): Card => ({
  id: title,
  title,
  notes: '',
  priority: DEFAULT_PRIORITY,
  parent: null,
  ...fields,
});

const board = (columns: Record<string, Card[]>): Board => ({
  columns: Object.entries(columns).map(([name, cards]) => ({ name, cards })),
});

describe('cardRows', () => {
  it('offers every card in board order when nothing has been typed', () => {
    const rows = cardRows(board({ Todo: [card('ship it')], Doing: [card('name the panes')] }), '');
    expect(rows.map((row) => row.name)).toEqual(['ship it', 'name the panes']);
    expect(rows.map((row) => row.detail)).toEqual(['Todo', 'Doing']);
  });

  it('answers with the card id, which is what puts the selection on it', () => {
    const rows = cardRows(board({ Todo: [card('ship it', { id: 'abc' })] }), 'ship');
    expect(rows[0].choice).toBe('abc');
  });

  it('sorts a tighter title match ahead of a looser one', () => {
    const rows = cardRows(board({ Todo: [card('save the pane typography'), card('pty')] }), 'pty');
    expect(rows.map((row) => row.name)).toEqual(['pty', 'save the pane typography']);
  });

  it('finds a card by a word in its description, and says which line it was on', () => {
    const cards = [card('fix the crash', { notes: 'the quit fires\nnode-pty exits during teardown' })];
    const rows = cardRows(board({ Doing: cards }), 'node-pty');
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBe('Doing · node-pty exits during teardown');
  });

  it('finds a card by a word in its trail', () => {
    const cards = [card('fix the crash', { comments: [{ body: 'the binary was in the wrong folder' }] })];
    expect(cardRows(board({ Doing: cards }), 'binary')[0].detail).toBe('Doing · the binary was in the wrong folder');
  });

  // Every title is a subsequence match for a long enough query, so a card that merely mentions the
  // word would otherwise trade places with a card named after it as the query grows.
  it('puts every title match ahead of every card that only mentions the query', () => {
    const cards = [card('mentions it', { notes: 'ship it' }), card('ship it')];
    expect(cardRows(board({ Todo: cards }), 'ship it').map((row) => row.name)).toEqual(['ship it', 'mentions it']);
  });

  it('matches a description as it is written, not letter by letter', () => {
    const cards = [card('a card', { notes: 'the pane typography' })];
    expect(cardRows(board({ Todo: cards }), 'pty')).toEqual([]);
  });

  it('offers a card once, however many of its lines hold the query', () => {
    const cards = [card('a card', { notes: 'pty here\npty there' })];
    expect(cardRows(board({ Todo: cards }), 'pty')).toHaveLength(1);
  });
});
