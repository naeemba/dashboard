import { parentPort } from 'node:worker_threads';
import { snapshotOf, type FileUsage } from '../../shared/usage/usage';
import { sweepUsage } from './usage-store';
import { countsSchedule, loadCounts, saveCounts } from './usage-counts';
import type { SweepReply, SweepRequest } from './usage-thread';

// The usage sweep's own thread. A first sweep with nothing saved reads every Claude Code log there has
// ever been: on a machine with 4.5 GB of them that is 18 seconds of reading and parsing, and on main's
// thread it held the event loop for up to 180 ms at a time, so every pane froze and typing stuttered
// for as long as it ran. Here it holds only this thread.
//
// The per-file counts live here, across sweeps, so they never cross the thread boundary. What goes
// back is the snapshot the renderer is sent, which is a few numbers per open project and pane. They are
// also saved to the file the request names (usage-counts.ts), and the first sweep of a launch starts
// from that file, so it reads only the logs written since the last run.

const known = new Map<string, FileUsage>();
const schedule = countsSchedule();

parentPort?.on('message', async (request: SweepRequest) => {
  let reply: SweepReply;
  try {
    const lastRun = schedule.toLoad() ? loadCounts(request.countsFile) : undefined;
    await sweepUsage(request.root, known, request.now, lastRun);
    schedule.swept();
    if (schedule.dueToSave(request.now)) {
      try {
        saveCounts(request.countsFile, known);
      } catch {
        // A full disk or a userData that is not writable. The figures are right; only the next launch
        // reads every log again, as one did before the counts were saved.
      }
    }
    reply = { snapshot: snapshotOf(known.values(), request.projects, request.paneSessions, request.now) };
  } catch (error) {
    reply = { error };
  }
  parentPort?.postMessage(reply);
});
