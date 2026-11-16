import type { EventEmitter } from 'node:events';

// What a program does when the reader of its output goes away, as `board list | head` does after ten
// lines: it ends quietly with the program's own exit code, like any Unix tool. Without a listener the
// stream's 'error' is unhandled, and node prints `write EPIPE` and a stack. The stream is destroyed
// after the first EPIPE, so later writes are dropped silently and the program finishes its work as it
// would anyway: `budget` over the cap still exits 1. Any other write failure is still thrown.
export function endQuietlyWhenOutputCloses(output: EventEmitter = process.stdout): void {
  output.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
  });
}
