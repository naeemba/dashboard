import { describe, expect, it } from 'vitest';
import { printWidths } from './print-widths';

describe('printWidths', () => {
  it('gives the current width when the pane was never resized', () => {
    expect(printWidths(() => 80).at(5)).toBe(80);
  });

  it('gives each row the width in effect when it was printed', () => {
    const widths = printWidths(() => 120);
    widths.resized(10, 80);
    widths.resized(30, 100);
    expect([widths.at(0), widths.at(9), widths.at(10), widths.at(29), widths.at(30)]).toEqual([80, 80, 100, 100, 120]);
  });
});
