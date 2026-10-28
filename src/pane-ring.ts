// The last stretch of a pane's output, kept so a screen that connects mid-run sees the pane as it is
// rather than blank. 256 KB is a few thousand lines: more than the screen, less than a memory problem
// times thirty panes. Replay opens with the terminal's full reset so a screen reconnecting after a drop
// shows the output once; a ring that holds nothing replays nothing, not a lone reset.
//
// It also holds how its shell ended. A ring is made per spawn and dropped with the pane, so the exit
// code goes when the shell it belongs to does, with no bookkeeping of its own: a screen joining after a
// shell died is told so, rather than shown a pane that looks alive and swallows every key.
export const PANE_RING_LIMIT = 256 * 1024;
const RESET = '\x1bc';

export type PaneRing = {
  push(data: string): void;
  replay(): string;
  exit(code: number): void;
  exitCode(): number | undefined;
};

export function paneRing(limit = PANE_RING_LIMIT): PaneRing {
  // ponytail: one string, sliced when it overflows; a chunk list if the slice ever shows in a profile.
  let text = '';
  let exitCode: number | undefined;
  return {
    push(data) {
      text += data;
      if (text.length > limit) text = text.slice(text.length - limit);
    },
    replay: () => (text === '' ? '' : RESET + text),
    exit(code) { exitCode = code; },
    exitCode: () => exitCode,
  };
}
