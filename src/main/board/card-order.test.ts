import { describe, expect, it } from 'vitest';
import { cardOrders, type OrderedCard } from './card-order';

function cards(...entries: [string, number | undefined][]): OrderedCard[] {
  return entries.map(([id, previous]) => ({ id, previous }));
}

describe('cardOrders', () => {
  it('numbers a column nobody has numbered yet 0, 1, 2', () => {
    expect(cardOrders(cards(['a', undefined], ['b', undefined], ['c', undefined]))).toEqual([0, 1, 2]);
  });

  it('keeps every number when nothing moved', () => {
    expect(cardOrders(cards(['a', 0], ['b', 1], ['c', 5]))).toEqual([0, 1, 5]);
  });

  // The point of the whole module: a move changes the one card that moved, so two branches moving
  // different cards never write the same file.
  it('gives a card moved down a number between its new neighbours and leaves the rest alone', () => {
    expect(cardOrders(cards(['b', 1], ['c', 2], ['a', 0], ['d', 3]))).toEqual([1, 2, 2.5, 3]);
  });

  it('puts a new card on top below the first number and one at the bottom above the last', () => {
    expect(cardOrders(cards(['new', undefined], ['a', 0], ['b', 1]))).toEqual([-1, 0, 1]);
    expect(cardOrders(cards(['a', 0], ['b', 1], ['new', undefined]))).toEqual([0, 1, 2]);
  });

  it('spreads several new cards evenly through one gap', () => {
    expect(cardOrders(cards(['a', 0], ['x', undefined], ['y', undefined], ['b', 3]))).toEqual([0, 1, 2, 3]);
  });

  // Two branches each adding a card at the top: both got the same number. Read back, the tie is broken
  // by id; written back in that order, nothing is rewritten.
  it('keeps two tied cards whose ids already put them in order', () => {
    expect(cardOrders(cards(['a', -1], ['b', -1], ['c', 0]))).toEqual([-1, -1, 0]);
  });

  it('renumbers the column when the order needs a number between two tied cards', () => {
    expect(cardOrders(cards(['a', -1], ['new', undefined], ['b', -1]))).toEqual([0, 1, 2]);
  });

  it('renumbers the column once halving has used the gap up', () => {
    const tight = cards(['a', 1], ['new', undefined], ['b', 1 + Number.EPSILON]);
    expect(cardOrders(tight)).toEqual([0, 1, 2]);
  });
});
