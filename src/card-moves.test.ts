import { describe, expect, it } from 'vitest';
import type { Board } from './board';
import { cardMoves } from './card-moves';

function board(columns: Record<string, string[]>): Board {
  return {
    columns: Object.entries(columns).map(([name, ids]) => ({
      name, cards: ids.map((id) => ({ id, title: `Card ${id}` }) as never),
    })),
  };
}

describe('cardMoves', () => {
  it('names each card that changed column', () => {
    expect(cardMoves(board({ Todo: ['a', 'b'], Doing: [] }), board({ Todo: ['b'], Doing: ['a'] })))
      .toEqual(['"Card a" Todo → Doing']);
  });
  it('says nothing about a reorder, a new card or a deleted one', () => {
    expect(cardMoves(board({ Todo: ['a', 'b'] }), board({ Todo: ['b', 'a', 'c'] }))).toEqual([]);
    expect(cardMoves(board({ Todo: ['a'] }), board({ Todo: [] }))).toEqual([]);
  });
});
