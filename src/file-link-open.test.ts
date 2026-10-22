import { describe, expect, it } from 'vitest';
import type { FileLink } from './file-links';
import { fileLinkOpener, visibleLinks, type ScreenBuffer } from './file-link-open';
import type { Handover } from './nvim-remote';
import type { Page } from './page';

const COLUMNS = 80;

// A buffer whose screen starts `viewportY` lines down, laid out the way xterm does it: a Han character
// is a cell of width 2 followed by a spacer of width 0, anything else one cell.
const buffer = (lines: string[], viewportY: number): ScreenBuffer => ({
  baseY: viewportY,
  length: lines.length,
  viewportY,
  getLine: (row) => {
    const text = lines[row];
    if (text === undefined) return undefined;
    const cells = [...text].flatMap((chars): [string, number][] => (
      /\p{Script=Han}/u.test(chars) ? [[chars, 2], ['', 0]] : [[chars, 1]]
    ));
    return {
      isWrapped: false,
      length: cells.length,
      translateToString: (trim) => (trim ? text.trimEnd() : text),
      getCell: (column) => {
        const [chars, width] = cells[column] ?? ['', 1];
        return { getChars: () => chars, getWidth: () => width };
      },
    };
  },
});

describe('visibleLinks', () => {
  it('reads the rows from viewportY down, bottom row first', () => {
    const screen = buffer(['old.ts above the screen', 'top.ts', 'x', '  bottom.ts'], 1);
    expect(visibleLinks(screen, 3, () => COLUMNS).map(({ row, column, link }) => [row, column, link.path])).toEqual([
      [2, 2, 'bottom.ts'],
      [0, 0, 'top.ts'],
    ]);
  });

  // The first half has scrolled off the top; the tail still gets a letter, where it begins.
  it('labels a wrapped path whose first row is above the screen', () => {
    const screen = buffer(['- a/b/cde/', '  f/g.md.', 'x'], 1);
    expect(visibleLinks(screen, 2, () => 10).map(({ row, column, link }) => [row, column, link.path])).toEqual([
      [0, 2, 'a/b/cde/f/g.md'],
    ]);
  });

  // The string has `a` at 2, the screen at cell 3: the label goes over the cell, not the offset.
  it('places a path after a wide character by its cell', () => {
    expect(visibleLinks(buffer(['漢 a.ts'], 0), 1, () => COLUMNS).map(({ column, link }) => [column, link.start])).toEqual([[3, 2]]);
  });
});

describe('fileLinkOpener', () => {
  const page = { slot: 2 } as Page;
  const link: FileLink = { start: 0, end: 8, path: 'src/a.ts' };
  const run = (answer: Promise<Handover>) => {
    const calls: string[] = [];
    const open = fileLinkOpener({ openFile: (slot, index) => { calls.push(`open ${slot} ${index}`); return answer; } }, {
      startEditor: () => calls.push('start'),
      showEditor: () => calls.push('show'),
      report: (message) => calls.push(`report ${message}`),
    });
    open(page, 1, link);
    return answer.catch(() => undefined).then(() => new Promise((resolve) => setTimeout(resolve))).then(() => calls);
  };

  it('starts nvim, then moves to it once the file is open', async () => {
    expect(await run(Promise.resolve({ ok: true, message: '' }))).toEqual(['start', 'open 2 1', 'show', 'report ']);
  });

  // A false underline such as `and/or` names no file, and the page stays where you were.
  it('stays put and says why when there is no such file', async () => {
    expect(await run(Promise.resolve({ ok: false, message: 'there is no file src/a.ts here' })))
      .toEqual(['start', 'open 2 1', 'report there is no file src/a.ts here']);
  });

  it('reports a call that failed outright', async () => {
    const calls = await run(Promise.reject(new Error('gone')));
    expect(calls.slice(0, 2)).toEqual(['start', 'open 2 1']);
    expect(calls[2]).toMatch(/^report Could not open src\/a\.ts: /);
  });
});
