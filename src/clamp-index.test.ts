import { describe, expect, it } from 'vitest';
import { clampIndex } from './clamp-index';

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
