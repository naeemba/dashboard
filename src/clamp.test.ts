import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

describe('clamp', () => {
  it('stops at both ends rather than wrapping round', () => {
    expect(clamp(3, 2)).toBe(2);
    expect(clamp(-1, 2)).toBe(0);
    expect(clamp(1, 2)).toBe(1);
  });

  it('answers 0 for a list with nothing in it', () => {
    expect(clamp(4, -1)).toBe(0);
  });
});
