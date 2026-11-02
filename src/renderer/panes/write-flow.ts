// How much a pane's terminal has been handed and not yet parsed, and when to ask main to stop reading
// its pty and start again: xterm.js's own flow-control pattern (its "Flow control" guide), counted in
// characters. Without it a program printing flat out fills xterm's write queue with seconds of output,
// and Ctrl+C reaches the program at once but the pane goes on drawing what was queued
// (docs/performance/history.md, finding 7). main/panes/output-pauses.ts is the other half.
export const HIGH_WATER = 100_000;
export const LOW_WATER = 10_000;

export type WriteFlow = { queued(length: number): void; parsed(length: number): void };

// Every chunk queued past the high mark asks again, not only the first: main's pause is a lease that
// lapses, and a terminal still behind when it does has to renew it.
export function writeFlow(ask: (paused: boolean) => void): WriteFlow {
  let pending = 0;
  let paused = false;
  return {
    queued(length) {
      pending += length;
      if (pending <= HIGH_WATER) return;
      paused = true;
      ask(true);
    },
    parsed(length) {
      pending -= length;
      if (!paused || pending >= LOW_WATER) return;
      paused = false;
      ask(false);
    },
  };
}
