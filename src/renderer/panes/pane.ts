import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { PrintWidths } from './print-widths';
import { isPrinted, tailLines } from '../../shared/manager/manager';
import { isRinging, looksBusy, type Bell } from '../../shared/panes/waiting';

// One pane: what it is, and what can be read off it. xterm has already laid the bytes out by the time
// anything here runs, so the escape codes, the redraws and the spinner overwriting itself are all
// resolved before a line is read — which is why the manager, the bell and the command screen all ask
// their questions of the screen rather than of the bytes. Lifted out of renderer.ts when that file
// reached its size ceiling; it is the group in there that needs nothing but a pane.

// `typedName` and `title` are the two things that can call a pane something other than its number.
// `typedName` is what you typed on it and survives a restart; `title` is what the program in it set,
// through the escape sequence every shell writes on every prompt, and dies with the program — the
// exit handler in renderer.ts drops it, because nvim's own reset on the way out never arrives. Which of
// the two wins is paneName's, in terminals.ts, beside the label they end up in — this only holds them.
// `bell` is whether the pane is asking for you and whether its banner has already gone out, so a pane
// that rings ten times does not raise ten of them.
// `bellTimer` is the one verdict a pane has pending on its own bell, held so a second ring inside the
// wait joins it rather than starting another.
// `lastPrintedAt` is when the pty last sent anything, which is what the manager prints an age from. It
// is the arrival of the bytes, not a change in what they say: a spinner redrawing the same line keeps
// the pane young, and that is the answer wanted — a pane drawing a spinner is not a pane nobody has
// touched since this morning. Zero until the first byte, which is a pane that has printed nothing.
// How far back a pane remembers, ten times xterm's default of a thousand. The number lives here
// because paneScrollback is what the size is for: the scrollback key hands the whole buffer to nvim,
// and an agent that has been working for an hour is well past a thousand lines — at the default the
// file opens with the top silently missing and nothing saying where it was cut. page.ts builds the
// terminal with it and the help dialog names it, so the two cannot say different numbers.
export const PANE_SCROLLBACK = 10000;

// `index` is which pane this is — main, a worker's number, or the editor's — since workers come and go
// and a page's list of panes has gaps. `element` is the box it is drawn in, which a worker that closes
// takes off the page with it. What a worker's hooks last said is drawn on that box as `data-mark`.
export type Pane = {
  index: number;
  element: HTMLElement;
  terminal: Terminal;
  fit: FitAddon;
  exited: boolean;
  // A worker folded to its name in the list, giving its room to the others.
  folded?: boolean;
  typedName?: string;
  title?: string;
  bell: Bell;
  bellTimer?: number;
  lastPrintedAt: number;
  printWidths: PrintWidths;
};

// What these read off, written structurally rather than as xterm's Terminal, so the walk in
// paneLastLine can be tested without building a terminal. xterm's own Terminal satisfies both.
export type PaneBuffer = {
  baseY: number;
  // Every line the pane holds, the scrollback above the screen included. `baseY` is where the screen
  // starts inside it, which is what separates the two readers below.
  length: number;
  getLine(row: number): { translateToString(trim: boolean): string } | undefined;
};
export type PaneTerminal = { rows: number; buffer: { active: PaneBuffer } };

// What a pane has on its screen, which is what you would see if you went there. The live screen rather
// than the scrollback, so scrolling a pane by hand does not change what the manager says about it.
export function paneScreen(terminal: PaneTerminal): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: terminal.rows }, (_value, row) => paneRow(buffer, row));
}

// One line by its own number in the buffer, scrollback and screen alike. The trailing spaces come off
// here and nowhere else: xterm pads every line out to the full width, and a reader that forgets is a
// row of the manager padded to eighty columns, or a file of whitespace in an editor. xterm's own trim
// drops only the cells nothing was written to; Claude Code's fullscreen view writes spaces out to the
// edge of every row, and those stay. Read untrimmed, a path at the end of such a row is followed by a
// space, and the half of it cut onto the next row is never joined back on.
export function bufferLine(buffer: PaneBuffer, row: number): string {
  return buffer.getLine(row)?.translateToString(true).trimEnd() ?? '';
}

// One row as cells, which is what xterm places a link and a label by. A string offset into `bufferLine`
// is not a cell: a wide character (CJK) takes two cells for one character, and an emoji two characters
// for its cells.
export type CellLine = {
  length: number;
  getCell(column: number): { getChars(): string; getWidth(): number } | undefined;
};

// The cell, counted from 0, that a string offset into the row's `bufferLine` text starts in. Walks the
// cells the way `translateToString` builds that text: a wide character's spacer cell adds nothing, and
// an empty cell reads as one space.
export function cellColumn(line: CellLine | undefined, stringIndex: number): number {
  if (!line) return stringIndex;
  let remaining = stringIndex;
  let column = 0;
  for (; column < line.length; column += 1) {
    const cell = line.getCell(column);
    if (!cell || cell.getWidth() === 0) continue;
    if (remaining <= 0) return column;
    remaining -= cell.getChars().length || 1;
  }
  return column + Math.max(remaining, 0);
}

// One row of what is on screen, counted from the top of it. Both screen readers go through here, so
// neither can drift into reading the scrollback.
function paneRow(buffer: PaneBuffer, row: number): string {
  return bufferLine(buffer, buffer.baseY + row);
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

// Whether a pane has an agent in it that is still going, which is the one question about a pane that
// only the screen can answer. Main holds the pty and so knows a process is there; it cannot tell an
// agent mid-work from one sitting at its own prompt with the card finished. Two things count as still
// going: a spinner, which looksBusy reads — the same question the bell asks before it believes a ring
// — and a pane still flagged as asking, which prints neither busy pattern and is an agent waiting on
// an answer from you.
//
// The flag is the weaker half and stays weak on purpose: focusing a pane clears its bell, because
// arriving at the pane is the answer to whatever it asked. So a pane whose agent asked something you
// have already glanced at reads as quiet again. working-panes.ts in main is what covers that gap, by
// keeping a pane working for a while after the last report that named it.
//
// This is not the question the command screen and the close ask any more. Theirs is `paneIsBusy` in
// pane-reading.ts, which says why a screen could never have answered it.
//
// Structural rather than `Pane` so the branch can be tested without building an xterm terminal; a real
// `Pane` satisfies it.
export function paneLooksBusy(pane: { bell: Bell; terminal: PaneTerminal }): boolean {
  return isRinging(pane.bell) || looksBusy(paneScreen(pane.terminal));
}

// The whole pane as a file: everything it holds, top of the scrollback to the last line printed. What
// Ctrl+` hands to nvim, so an agent's transcript can be searched and yanked with real editor tools.
//
// The blank rows below the prompt go. A pane holds thousands of lines and shows perhaps forty; the rest
// of the buffer is empty rows waiting to be written into, and keeping them opens the file at the bottom
// of a screenful of nothing with the transcript somewhere above — the thing the key exists to stop.
// Blank lines *inside* the output stay: they are the agent's own spacing.
//
// Unlike paneScreen, this one is deliberately the scrollback. Scrolling a pane by hand must not change
// what the manager says about it, but it must not change what you get here either — you asked for the
// pane, not for the forty lines of it that happen to be showing.
export function paneScrollback(terminal: PaneTerminal): string {
  const buffer = terminal.buffer.active;
  const rows = Array.from({ length: buffer.length }, (_value, row) => bufferLine(buffer, row));
  const text = rows.join('\n').trimEnd();
  return text === '' ? '' : `${text}\n`;
}
