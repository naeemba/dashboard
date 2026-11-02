import type { EventEmitter } from 'node:events';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { UsageSnapshot } from '../../shared/usage/usage';
import { unpacked } from '../app/unpacked';

// Main's side of the sweep's own thread (usage-worker.ts says why there is one): what is asked, what
// comes back, and the one decision about the answer, pinned by usage-thread.test.ts.

export type SweepRequest = {
  root: string;
  now: number;
  projects: { path: string; worktrees: string }[];
  paneSessions: Map<string, string>;
};

export type SweepReply = { snapshot: UsageSnapshot } | { error: unknown };

// What a sweep needs of the thread. A Worker is one; the test hands in an EventEmitter.
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

// Built beside main as its own file, and unpacked for the reason the CLI entries are (unpacked.ts).
// Worked out when a thread starts, not on import, so the performance script can load this file as a
// module, where there is no __dirname. Unref'd so it never keeps the app from quitting.
function startWorker(): Thread {
  const worker = new Worker(unpacked(path.join(__dirname, 'usage-worker.js')));
  worker.unref();
  return worker;
}

// Started on the first sweep and kept for the life of the app, since the counts it holds are what make
// every sweep after the first one cheap. A thread that died is replaced on the next sweep, which then
// reads every log again from the start. The test hands in its own starter.
export function usageThread(start: () => Thread = startWorker): (request: SweepRequest) => Promise<UsageSnapshot> {
  let thread: Thread | undefined;
  return (request) => {
    if (thread === undefined) {
      thread = start();
      thread.once('exit', () => { thread = undefined; });
    }
    return requestSweep(thread, request);
  };
}
