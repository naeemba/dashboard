import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { PaneUse } from './free-pane';
import { isPrinted, tailLines } from './manager';
import { isRinging, looksBusy, type Bell } from './waiting';

// One pane: what it is, and what can be read off it. xterm has already laid the bytes out by the time
// anything here runs, so the escape codes, the redraws and the spinner overwriting itself are all
// resolved before a line is read — which is why the manager, the bell and the command screen all ask
// their questions of the screen rather than of the bytes. Lifted out of renderer.ts when that file
// reached its size ceiling; it is the group in there that needs nothing but a pane.

// `name` is what the status bar and the bell's notification call the pane; `bell` is whether the pane
// is asking for you and whether its banner has already gone out, so a pane that rings ten times does
// not raise ten of them.
// `bellTimer` is the one verdict a pane has pending on its own bell, held so a second ring inside the
// wait joins it rather than starting another.
// `lastPrintedAt` is when the pty last sent anything, which is what the manager prints an age from. It
// is the arrival of the bytes, not a change in what they say: a spinner redrawing the same line keeps
// the pane young, and that is the answer wanted — a pane drawing a spinner is not a pane nobody has
// touched since this morning. Zero until the first byte, which is a pane that has printed nothing.
export type Pane = {
  terminal: Terminal;
  fit: FitAddon;
  exited: boolean;
  name: string;
  bell: Bell;
  bellTimer?: number;
  lastPrintedAt: number;
};

// What these read off, written structurally rather than as xterm's Terminal, so the walk in
// paneLastLine can be tested without building a terminal. xterm's own Terminal satisfies both.
export type PaneBuffer = {
  baseY: number;
  getLine(row: number): { translateToString(trim: boolean): string } | undefined;
};
export type PaneTerminal = { rows: number; buffer: { active: PaneBuffer } };

// What a pane has on its screen, which is what you would see if you went there. The live screen rather
// than the scrollback, so scrolling a pane by hand does not change what the manager says about it.
export function paneScreen(terminal: PaneTerminal): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: terminal.rows }, (_value, row) => paneRow(buffer, row));
}

// One row of what is on screen, counted from the top of it. Both readers go through here, so neither
// can drift into reading the scrollback or leaving the trailing spaces on.
function paneRow(buffer: PaneBuffer, row: number): string {
  return buffer.getLine(buffer.baseY + row)?.translateToString(true) ?? '';
}

// What the manager prints on a row, which is the last few lines of the same screen. The bell reads
// the screen whole instead, so how much of it a row has space for cannot decide what a bell means.
export function paneTail(terminal: PaneTerminal): string[] {
  return tailLines(paneScreen(terminal));
}

// The one line a quiet row prints, walked up from the bottom of the screen and stopped at the first
// row with anything on it. The same line `paneTail` would end on, read without laying the other
// twenty-odd out: every pane of every opened project asks for this on every arrow key, and thirty
// panes laying out a screen each to use one line of it is the work nobody sees.
export function paneLastLine(terminal: PaneTerminal): string {
  const buffer = terminal.buffer.active;
  for (let row = terminal.rows - 1; row >= 0; row -= 1) {
    const line = paneRow(buffer, row);
    if (isPrinted(line)) return line;
  }
  return '';
}

// What free-pane.ts picks from, read off one live pane. `busy` is both halves of "an agent has this
// pane": still working, which looksBusy reads off the screen — the same question the bell asks before
// it believes a ring — and stopped to ask you something, which prints neither of those patterns and is
// the pane a command would be submitted into as the answer. A pane running an ordinary long command
// is neither, and is a candidate.
export function paneUse(pane: Pane): PaneUse {
  return { exited: pane.exited, busy: isRinging(pane.bell) || looksBusy(paneScreen(pane.terminal)) };
}
