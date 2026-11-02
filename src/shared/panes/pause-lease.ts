// How long main holds a pane's pty paused for its window without hearing again: main's
// output-pauses.ts holds the lease and the renderer's write-flow.ts renews it, so both read this one.
export const PAUSE_LEASE_MS = 1000;
