import { describe, expect, it } from 'vitest';
import { neighbor } from './terminals';

describe('neighbor', () => {
  it('moves along a row and stops at the edge', () => {
    expect(neighbor(0, 'right')).toBe(1);
    expect(neighbor(1, 'right')).toBe(1);
    expect(neighbor(3, 'left')).toBe(2);
    expect(neighbor(2, 'left')).toBe(2);
  });

  it('moves between rows by horizontal position', () => {
    expect(neighbor(0, 'down')).toBe(2);
    expect(neighbor(1, 'down')).toBe(4);
    expect(neighbor(2, 'up')).toBe(0);
    expect(neighbor(4, 'up')).toBe(1);
    expect(neighbor(0, 'up')).toBe(0);
    expect(neighbor(3, 'down')).toBe(3);
  });
});
