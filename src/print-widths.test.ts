import { describe, expect, it } from 'vitest';
import { printWidths } from './print-widths';

type Fake = { line: number; isDisposed: boolean };

// A pane whose width, cursor line and buffer the test moves by hand.
function pane(cols: number) {
  const state = { cols, cursor: 0, normal: true };
  const widths = printWidths({
    cols: () => state.cols,
    mark: () => ({ line: state.cursor, isDisposed: false }),
    isNormalBuffer: () => state.normal,
  });
  const resize = (to: number) => { state.cols = to; widths.resized(); };
  return { state, widths, resize };
}

describe('printWidths', () => {
  it('gives the current width when the pane was never resized', () => {
    expect(pane(80).widths.at(5)).toBe(80);
  });

  it('gives each row the width in effect when it was printed', () => {
    const { state, widths, resize } = pane(80);
    state.cursor = 10;
    resize(100);
    state.cursor = 30;
    resize(120);
    expect([widths.at(0), widths.at(9), widths.at(10), widths.at(29), widths.at(30)]).toEqual([80, 80, 100, 100, 120]);
  });

  it('ignores a resize that kept the width', () => {
    const { state, widths, resize } = pane(80);
    state.cursor = 10;
    resize(80);
    expect(widths.at(0)).toBe(80);
  });

  it('follows a boundary the scrollback moved and skips one it trimmed away', () => {
    const marks: Fake[] = [];
    const state = { cols: 80, cursor: 0 };
    const widths = printWidths({
      cols: () => state.cols,
      mark: () => { const marker = { line: state.cursor, isDisposed: false }; marks.push(marker); return marker; },
      isNormalBuffer: () => true,
    });
    state.cursor = 10;
    state.cols = 100;
    widths.resized();
    state.cursor = 30;
    state.cols = 120;
    widths.resized();
    marks[0].line = -1;
    marks[0].isDisposed = true;
    marks[1].line = 20;
    expect([widths.at(0), widths.at(19), widths.at(20)]).toEqual([100, 100, 120]);
  });

  it('forgets every boundary on reset', () => {
    const { state, widths, resize } = pane(80);
    state.cursor = 10;
    resize(120);
    widths.reset();
    expect(widths.at(0)).toBe(120);
  });

  describe('a cursor that moves above the latest boundary', () => {
    it('moves the boundary up, so rows printed there read the new width', () => {
      const { state, widths, resize } = pane(120);
      state.cursor = 40;
      resize(80);
      state.cursor = 35;
      widths.rowErased(35);
      expect([widths.at(34), widths.at(35), widths.at(39)]).toEqual([120, 80, 80]);
    });

    it('drops an older boundary the moved one would shadow', () => {
      const { state, widths, resize } = pane(100);
      state.cursor = 20;
      resize(120);
      state.cursor = 40;
      resize(80);
      state.cursor = 10;
      widths.rowErased(10);
      expect([widths.at(5), widths.at(15), widths.at(30)]).toEqual([120, 80, 80]);
    });

    it('gives the moved boundary the width of the first boundary at or below the line', () => {
      const { state, widths, resize } = pane(100);
      state.cursor = 40;
      resize(80);
      resize(90);
      state.cursor = 20;
      widths.rowErased(20);
      expect([widths.at(5), widths.at(25)]).toEqual([80, 90]);
    });

    it('leaves the boundary alone when the cursor stays at or below it', () => {
      const { state, widths, resize } = pane(120);
      state.cursor = 40;
      resize(80);
      state.cursor = 50;
      widths.rowErased(50);
      widths.rowErased(40);
      expect([widths.at(39), widths.at(40)]).toEqual([120, 80]);
    });
  });

  describe('on the alternate screen', () => {
    it('measures every row at the current width', () => {
      const { state, widths, resize } = pane(100);
      state.cursor = 10;
      resize(140);
      state.normal = false;
      expect(widths.at(3)).toBe(140);
    });

    it('keeps the boundaries when a screen row is reported there', () => {
      const { state, widths, resize } = pane(80);
      state.cursor = 540;
      resize(120);
      state.normal = false;
      state.cursor = 3;
      widths.rowErased(3);
      state.normal = true;
      expect(widths.at(500)).toBe(80);
    });

    it('records a resize that happened there once the normal buffer is back', () => {
      const { state, widths, resize } = pane(80);
      state.cursor = 30;
      state.normal = false;
      resize(120);
      state.normal = true;
      widths.resized();
      expect([widths.at(29), widths.at(30)]).toEqual([80, 120]);
    });
  });
});
