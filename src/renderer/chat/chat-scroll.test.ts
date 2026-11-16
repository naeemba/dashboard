import { describe, expect, it } from 'vitest';
import { nearBottom } from './chat-scroll';

const box = (scrollHeight: number, scrollTop: number, clientHeight: number): HTMLElement =>
  ({ scrollHeight, scrollTop, clientHeight }) as HTMLElement;

describe('nearBottom', () => {
  it('counts a box at its end, or within a line of it, as at the bottom', () => {
    expect(nearBottom(box(3000, 2700, 300))).toBe(true);
    expect(nearBottom(box(3000, 2670, 300))).toBe(true);
  });

  it('counts a box the reader scrolled up as not at the bottom', () => {
    expect(nearBottom(box(3000, 1750, 300))).toBe(false);
  });

  // A screen under a hidden page reads all zeros: it stays pinned, so it goes to its end when shown.
  it('counts a hidden box as at the bottom', () => {
    expect(nearBottom(box(0, 0, 0))).toBe(true);
  });
});
