import { describe, expect, it } from 'vitest';
import { placeAbove, POPUP_GAP } from './popup-placement';

const window = { width: 1000, height: 800 };

describe('placeAbove', () => {
  it('opens above an anchor on the right, lined up with its right edge', () => {
    expect(placeAbove({ left: 800, right: 900, top: 780 }, window)).toEqual({ bottom: 20 + POPUP_GAP, left: null, right: 100, maxHeight: 780 - 2 * POPUP_GAP });
  });

  it('opens above an anchor on the left, lined up with its left edge', () => {
    expect(placeAbove({ left: 120, right: 200, top: 780 }, window)).toMatchObject({ left: 120, right: null });
  });

  it('keeps a gap from the window edge for an anchor that touches it', () => {
    expect(placeAbove({ left: 0, right: 50, top: 780 }, window).left).toBe(POPUP_GAP);
    expect(placeAbove({ left: 950, right: 1000, top: 780 }, window).right).toBe(POPUP_GAP);
  });
});
