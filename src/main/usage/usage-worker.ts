import { parentPort } from 'node:worker_threads';
import { snapshotOf, type FileUsage } from '../../shared/usage/usage';
import { sweepUsage } from './usage-store';
import type { SweepReply, SweepRequest } from './usage-thread';

// The usage sweep's own thread. The first sweep after a launch reads every Claude Code log there has
// ever been: on a machine with 4.5 GB of them that is 18 seconds of reading and parsing, and on main's
// thread it held the event loop for up to 180 ms at a time, so every pane froze and typing stuttered
// for as long as it ran. Here it holds only this thread.
//
// The per-file counts live here, across sweeps, so they never cross the thread boundary. What goes
// back is the snapshot the renderer is sent, which is a few numbers per open project and pane.

const known = new Map<string, FileUsage>();

parentPort?.on('message', (request: SweepRequest) => {
  void sweepUsage(request.root, known, request.now).then(
    () => snapshotOf(known.values(), request.projects, request.paneSessions, request.now),
  ).then(
    (snapshot): SweepReply => ({ snapshot }),
    (error: unknown): SweepReply => ({ error }),
  ).then((reply) => parentPort?.postMessage(reply));
});
