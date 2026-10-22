import { describe, expect, it } from 'vitest';
import type { FileLink } from './file-links';
import { fileLinkOpener, visibleLinks, type ScreenBuffer } from './file-link-open';
import type { Page } from './page';

// A buffer whose screen starts `viewportY` lines down, one cell per character.
const buffer = (lines: string[], viewportY: number): ScreenBuffer => ({
  baseY: viewportY,
  length: lines.length,
  viewportY,
  getLine: (row) => {
    const text = lines[row];
    if (text === undefined) return undefined;
    return {
      length: text.length,
      translateToString: (trim) => (trim ? text.trimEnd() : text),
      getCell: (column) => ({ getChars: () => text[column] ?? '', getWidth: () => 1 }),
    };
  },
});

describe('visibleLinks', () => {
  it('reads the rows from viewportY down, bottom row first', () => {
    const screen = buffer(['old.ts above the screen', 'top.ts', 'x', '  bottom.ts'], 1);
    expect(visibleLinks(screen, 3).map(({ row, column, link }) => [row, column, link.path])).toEqual([
      [2, 2, 'bottom.ts'],
      [0, 0, 'top.ts'],
    ]);
  });
});

describe('fileLinkOpener', () => {
  const page = { slot: 2 } as Page;
  const link: FileLink = { start: 0, end: 8, path: 'src/a.ts' };
  const run = (answer: Promise<{ ok: boolean; message: string }>) => {
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
