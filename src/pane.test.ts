import { describe, expect, it } from 'vitest';
import type { Bell } from './waiting';
import { paneLastLine, paneScreen, paneUse, type PaneTerminal } from './pane';

// A screen of `rows` lines starting at `baseY`, with the scrollback above it filled with lines that
// must never be read.
const terminal = (rows: string[], baseY = 2): PaneTerminal => ({
  rows: rows.length,
  buffer: {
    active: {
      baseY,
      getLine(row: number) {
        const line = row < baseY ? `scrollback ${row}` : rows[row - baseY];
        return line === undefined ? undefined : { translateToString: () => line };
      },
    },
  },
});

describe('paneScreen', () => {
  it('reads the live screen, never the scrollback above it', () => {
    expect(paneScreen(terminal(['npm test', '3 passing']))).toEqual(['npm test', '3 passing']);
  });

  it('reads a row the buffer has nothing for as an empty line', () => {
    expect(paneScreen({ ...terminal([]), rows: 2 })).toEqual(['', '']);
  });
});

describe('paneLastLine', () => {
  it('walks up past the blank rows under the prompt to the last line that printed something', () => {
    expect(paneLastLine(terminal(['npm test', '3 passing', '   ', '']))).toBe('3 passing');
  });

  it('answers nothing for a pane that has printed nothing', () => {
    expect(paneLastLine(terminal(['', '  ']))).toBe('');
  });
});

describe('paneUse', () => {
  const live = (bell: Bell, screen: string) => ({ exited: false, bell, terminal: terminal([screen]) });

  it('holds a pane whose agent has stopped to ask, which prints neither busy pattern', () => {
    expect(paneUse(live('waiting', 'Continue? [Y/n]')).busy).toBe(true);
  });

  it('holds a pane whose agent is still working, whatever its bell says', () => {
    expect(paneUse(live('quiet', 'esc to interrupt')).busy).toBe(true);
  });

  it('frees a pane running an ordinary long command, which is all this can tell', () => {
    expect(paneUse(live('quiet', 'VITE ready in 300 ms'))).toEqual({ exited: false, busy: false });
  });
});
