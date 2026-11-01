import type { EventEmitter } from 'node:events';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { UsageSnapshot } from '../../shared/usage/usage';

// Main's side of the sweep's own thread (usage-worker.ts says why there is one): what is asked, what
// comes back, and the one decision about the answer, pinned by usage-thread.test.ts.

export type SweepRequest = {
  root: string;
  now: number;
  projects: { path: string; worktrees: string }[];
  paneSessions: Map<string, string>;
};

export type SweepReply = { snapshot: UsageSnapshot } | { error: unknown };

// What a request needs of the thread. A Worker is one; the test hands in an EventEmitter.
type Thread = EventEmitter & { postMessage(request: SweepRequest): void };

// One sweep, answered once. A thread that dies mid-sweep — out of memory on a log far larger than any
// seen, or a bug in the reading — rejects the sweep it was running rather than leaving it pending,
// which would stop every sweep after it, since each is chained on the last.
export function requestSweep(thread: Thread, request: SweepRequest): Promise<UsageSnapshot> {
  return new Promise((resolve, reject) => {
    const settle = (): void => {
      thread.off('message', answered);
      thread.off('error', failed);
      thread.off('exit', exited);
    };
    const answered = (reply: SweepReply): void => {
      settle();
      if ('error' in reply) reject(reply.error);
      else resolve(reply.snapshot);
    };
    const failed = (error: unknown): void => {
      settle();
      reject(error);
    };
    const exited = (code: number): void => failed(new Error(`the usage sweep's thread stopped (exit code ${code})`));
    thread.on('message', answered);
    thread.on('error', failed);
    thread.on('exit', exited);
    thread.postMessage(request);
  });
}

// Started on the first sweep and kept for the life of the app, since the counts it holds are what make
// every sweep after the first one cheap. Unref'd so it never keeps the app from quitting. A thread
// that died is replaced on the next sweep, which then reads every log again from the start.
export function usageThread(): (request: SweepRequest) => Promise<UsageSnapshot> {
  let thread: Worker | undefined;
  return (request) => {
    if (thread === undefined) {
      // Built beside main as its own file, and unpacked for the reason the CLI entries are: a worker
      // thread is started from a path on disk, and that path cannot be inside the asar. In development
      // there is no asar in the path and the replace does nothing. Worked out here, not on import, so
      // the performance script can load this file as a module, where there is no __dirname.
      const workerFile = path
        .join(__dirname, 'usage-worker.js')
        .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
      const started = new Worker(workerFile);
      started.unref();
      started.once('exit', () => { if (thread === started) thread = undefined; });
      thread = started;
    }
    return requestSweep(thread, request);
  };
}
