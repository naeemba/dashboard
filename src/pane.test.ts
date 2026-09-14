import { describe, expect, it } from 'vitest';
import type { Bell } from './waiting';
import { paneLastLine, paneScreen, paneScrollback, paneUse, type PaneTerminal } from './pane';

// A screen of `rows` lines starting at `baseY`, with the scrollback above it filled with lines that
// must never be read.
const terminal = (rows: string[], baseY = 2): PaneTerminal => ({
  rows: rows.length,
  buffer: {
    active: {
      baseY,
      length: baseY + rows.length,
      getLine(row: number) {
        const line = row < baseY ? `scrollback ${row}` : rows[row - baseY];
        // Trimmed on the flag, the way xterm does it: every line comes back padded to the full width
        // unless the reader asks for it trimmed, and both readers here do.
        return line === undefined ? undefined : { translateToString: (trim: boolean) => (trim ? line.trimEnd() : line) };
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

describe('paneScrollback', () => {
  it('reads the scrollback as well as the screen, top to bottom', () => {
    expect(paneScrollback(terminal(['npm test', '3 passing'])))
      .toBe('scrollback 0\nscrollback 1\nnpm test\n3 passing\n');
  });

  it('takes the padding xterm puts on the right off every line', () => {
    expect(paneScrollback(terminal(['npm test     '], 0))).toBe('npm test\n');
  });

  // A pane holds a thousand lines and shows forty. Keep the empty ones and the file opens at the bottom
  // of a screenful of nothing, with the transcript somewhere above it.
  it('drops the empty rows below the last thing printed', () => {
    expect(paneScrollback(terminal(['done', '', '   ', ''], 0))).toBe('done\n');
  });

  it("keeps the blank lines inside the output, which are the agent's own spacing", () => {
    expect(paneScrollback(terminal(['one', '', 'two'], 0))).toBe('one\n\ntwo\n');
  });

  it('gives an empty file for a pane that has printed nothing, not a lone newline', () => {
    expect(paneScrollback(terminal(['', '', ''], 0))).toBe('');
  });

  it('reads a row the buffer has nothing for as a blank line', () => {
    const gappy: PaneTerminal = {
      rows: 1,
      buffer: { active: { baseY: 0, length: 3, getLine: (row) => (row === 0 ? { translateToString: () => 'here' } : undefined) } },
    };
    expect(paneScrollback(gappy)).toBe('here\n');
  });
});
