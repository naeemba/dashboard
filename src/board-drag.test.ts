import { describe, expect, it } from 'vitest';
import { dropRow } from './board-drag';

// Three cards, 20px tall, stacked from y=0: midpoints at 10, 30 and 50.
const THREE = [10, 30, 50];

describe('dropRow', () => {
  it('lands above the card the pointer is in the top half of', () => {
    expect(dropRow(THREE, 5)).toBe(0);
    expect(dropRow(THREE, 25)).toBe(1);
  });

  it('lands below the card the pointer is in the bottom half of', () => {
    expect(dropRow(THREE, 15)).toBe(1);
    expect(dropRow(THREE, 35)).toBe(2);
  });

  // The whole reason the midpoint is the line rather than the gap between two cards: a full column
  // has nothing under the last card to aim at, so the last card's own bottom half has to mean "last".
  it('lands last from the bottom half of the last card', () => {
    expect(dropRow(THREE, 55)).toBe(3);
  });

  it('puts the only card an empty column can hold at the top of it', () => {
    expect(dropRow([], 400)).toBe(0);
  });
});
