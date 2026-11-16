import type { EventEmitter } from 'node:events';

// What a program does when the reader of its output goes away, as `board list | head` does after ten
// lines: it ends quietly with exit 0, like any Unix tool. Without a listener the stream's 'error' is
// unhandled, and node prints `write EPIPE` and a stack. By then the work is done: every program writes
// its files before it prints. Any other write failure is still thrown.
export function endQuietlyWhenOutputCloses(output: EventEmitter, exit: (code: number) => void): void {
  output.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
    exit(0);
  });
}
