import { PAUSE_LEASE_MS } from '../../shared/panes/pause-lease';

// How much a pane's terminal has been handed and not yet parsed, and when to ask main to stop reading
// its pty and start again: xterm.js's own flow-control pattern (its "Flow control" guide), counted in
// characters. Without it a program printing flat out fills xterm's write queue with seconds of output,
// and Ctrl+C reaches the program at once but the pane goes on drawing what was queued
// (docs/performance/history.md, finding 7). main/panes/output-pauses.ts is the other half.
export const HIGH_WATER = 100_000;
export const LOW_WATER = 10_000;

export type WriteFlow = { queued(length: number): void; parsed(length: number): void };

// main's pause is a lease that lapses a lease after the last ask (output-pauses.ts), so a terminal still
// behind asks again, at most every half lease rather than on every chunk. Nothing new arrives while the
// pty is paused, so the renewal rides on the backlog drawing (parsed), not only on new chunks (queued).
export const RENEW_MS = PAUSE_LEASE_MS / 2;

export function writeFlow(ask: (paused: boolean) => void, now: () => number = Date.now): WriteFlow {
  let pending = 0;
  let paused = false;
  let askedAt = -Infinity;
  function pause(): void {
    if (paused && now() - askedAt < RENEW_MS) return;
    paused = true;
    askedAt = now();
    ask(true);
  }
  return {
    queued(length) {
      pending += length;
      if (pending > HIGH_WATER) pause();
    },
    parsed(length) {
      pending -= length;
      if (!paused) return;
      if (pending >= LOW_WATER) return pause();
      paused = false;
      ask(false);
    },
  };
}
