import { describe, expect, it } from 'vitest';
import { clampIndex, heldIndex } from './clamp-index';

describe('clampIndex', () => {
  it('stops at both ends rather than wrapping round', () => {
    expect(clampIndex(3, 2)).toBe(2);
    expect(clampIndex(-1, 2)).toBe(0);
    expect(clampIndex(1, 2)).toBe(1);
  });

  it('answers 0 for a list with nothing in it', () => {
    expect(clampIndex(4, -1)).toBe(0);
  });
});

describe('heldIndex', () => {
  it('follows what the selection was on when something opens in front of it', () => {
    expect(heldIndex(['a', 'b', 'c'], 'b', 0)).toBe(1);
  });

  it('holds the position it had when what it was on has gone', () => {
    expect(heldIndex(['a', 'c'], 'b', 1)).toBe(1);
  });

  it('comes back to the last one when the position it held is past the end', () => {
    expect(heldIndex(['a'], 'b', 2)).toBe(0);
  });

  it('answers 0 for a list with nothing left in it', () => {
    expect(heldIndex([], 'b', 3)).toBe(0);
  });

  // The log's rows have no key of their own, so the entry itself is the key: the same object is the
  // same line, and an equal-looking one is not.
  it('follows an object by identity rather than by what it holds', () => {
    const held = { message: 'b' };
    expect(heldIndex([{ message: 'a' }, { message: 'b' }, held], held, 0)).toBe(2);
  });

  it('holds the position when there was nothing selected before', () => {
    expect(heldIndex(['a', 'b'], undefined, 1)).toBe(1);
  });
});
