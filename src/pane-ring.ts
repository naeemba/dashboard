// The last stretch of a pane's output, kept so a screen that connects mid-run sees the pane as it is
// rather than blank. 256 KB is a few thousand lines: more than the screen, less than a memory problem
// times thirty panes. Replay opens with the terminal's full reset so a screen reconnecting after a drop
// shows the output once.
export const PANE_RING_LIMIT = 256 * 1024;
const RESET = '\x1bc';

export type PaneRing = { push(data: string): void; replay(): string };

export function paneRing(limit = PANE_RING_LIMIT): PaneRing {
  // ponytail: one string, sliced when it overflows; a chunk list if the slice ever shows in a profile.
  let text = '';
  return {
    push(data) {
      text += data;
      if (text.length > limit) text = text.slice(text.length - limit);
    },
    replay: () => RESET + text,
  };
}
