import { describe, expect, it } from 'vitest';
import { printWidths } from './print-widths';

const marker = (line: number) => ({ line, isDisposed: false });

describe('printWidths', () => {
  it('gives the current width when the pane was never resized', () => {
    expect(printWidths(() => 80).at(5)).toBe(80);
  });

  it('gives each row the width in effect when it was printed', () => {
    const widths = printWidths(() => 120);
    widths.resized(marker(10), 80);
    widths.resized(marker(30), 100);
    expect([widths.at(0), widths.at(9), widths.at(10), widths.at(29), widths.at(30)]).toEqual([80, 80, 100, 100, 120]);
  });

  it('never applies the default width of the first fit, which happens at the cursor on line 0', () => {
    const widths = printWidths(() => 60);
    widths.resized(marker(0), 80);
    expect([widths.at(0), widths.at(23), widths.at(100)]).toEqual([60, 60, 60]);
  });

  it('follows a boundary the scrollback moved and skips one it trimmed away', () => {
    const widths = printWidths(() => 120);
    const first = { line: 10, isDisposed: false };
    const second = { line: 30, isDisposed: false };
    widths.resized(first, 80);
    widths.resized(second, 100);
    first.line = -1;
    first.isDisposed = true;
    second.line = 20;
    expect([widths.at(0), widths.at(19), widths.at(20)]).toEqual([100, 100, 120]);
  });

  it('forgets every boundary on reset', () => {
    const widths = printWidths(() => 120);
    widths.resized(marker(10), 80);
    widths.reset();
    expect(widths.at(0)).toBe(120);
  });
});
