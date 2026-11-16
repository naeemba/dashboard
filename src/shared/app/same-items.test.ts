import { describe, expect, it } from 'vitest';
import { sameItems } from './same-items';

describe('sameItems', () => {
  it('is the same list only with the same items in the same order', () => {
    const first = { row: 1 };
    const second = { row: 2 };
    expect(sameItems([first, second], [first, second])).toBe(true);
    expect(sameItems([first, second], [second, first])).toBe(false);
    expect(sameItems([first], [first, second])).toBe(false);
    expect(sameItems([{ row: 1 }], [first])).toBe(false);
  });

  it('compares by the test it is given, for elements built afresh to check against the ones on screen', () => {
    expect(sameItems(['a', 'b'], ['A', 'B'], (one, other) => one.toLowerCase() === other.toLowerCase())).toBe(true);
  });
});
