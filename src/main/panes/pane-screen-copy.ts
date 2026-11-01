import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/headless';

// A pane's screen as the host holds it, kept so a screen that connects mid-run sees the pane as it is
// rather than blank. A headless terminal reads every byte the shell writes, so the replay is the
// screen itself: the visible cells, the scrollback, the alternate buffer a full-screen program draws
// on, and the modes it switched on once at start (mouse tracking, bracketed paste, application keys).
// A raw tail of the bytes could hold none of that once nvim had run for a while, and could start in
// the middle of an escape sequence. Replay opens with the terminal's full reset so a screen
// reconnecting after a drop shows the output once; a pane that has printed nothing replays nothing.
//
// It also holds how its shell ended. One is made per spawn and dropped with the pane, so the exit code
// goes when the shell it belongs to does, with no bookkeeping of its own: a screen joining after a
// shell died is told so, rather than shown a pane that looks alive and swallows every key.
//
// The replay keeps a tenth of the lines a pane on screen keeps (pane.ts's PANE_SCROLLBACK). Every live
// pane has one of these in main for as long as it runs, at about 12 bytes a cell: ten thousand lines
// of a 200-column pane is some 24 MB, times six panes a project. A screen joining, or this window
// coming home from another host, starts a pane at most this far back from its end.
const REPLAY_SCROLLBACK = 1000;
const RESET = '\x1bc';

export type PaneScreenCopy = {
  push(data: string): void;
  replay(): string;
  exit(code: number): void;
  exitCode(): number | undefined;
};

// `size` is the shell's own size, read on every push: the shell redraws for a resize in the bytes that
// follow it, so taking the size there keeps the copy in step without anyone telling it about resizes.
export function paneScreenCopy(size: () => { cols: number; rows: number }): PaneScreenCopy {
  const { cols, rows } = size();
  const terminal = new Terminal({ cols, rows, scrollback: REPLAY_SCROLLBACK, allowProposedApi: true });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  // The terminal parses on a timer, so what was pushed and not parsed yet is kept beside it and
  // replayed after the screen; each write takes its own bytes off the front once it has been parsed.
  let unparsed = '';
  let printed = false;
  let exitCode: number | undefined;
  return {
    push(data) {
      const now = size();
      if (now.cols !== terminal.cols || now.rows !== terminal.rows) terminal.resize(now.cols, now.rows);
      printed = true;
      unparsed += data;
      terminal.write(data, () => { unparsed = unparsed.slice(data.length); });
    },
    replay: () => (printed ? RESET + serializer.serialize() + unparsed : ''),
    exit(code) { exitCode = code; },
    exitCode: () => exitCode,
  };
}
