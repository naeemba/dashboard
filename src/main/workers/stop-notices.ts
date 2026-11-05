import type { WorkerState } from '../../shared/app/bridge';
import { isPaused, type StopWaiting } from '../../shared/workers/worker-roster';

// When main hears that a worker it dispatched has stopped. A worker's turn ends whenever it waits on
// its own background work — a review subagent, CI, a loop — and wakes again when that work reports, so
// a notice per turn end gave main dozens per card, each a turn spent saying "still waiting". Claude
// Code's Stop hook says which it is: what is still in flight and what is scheduled to wake it
// (StopWaiting). Nothing in either is the worker done, and main is told within REPORT_SETTLE_MS;
// anything in either is a pause, and nobody is told until a later stop finds both empty. Once per stop, and not at all for a
// stop the worker's own report already covers (workers-decision-1).
//
// A hook that sends neither — an older Claude Code, or an older command — leaves only the grace
// period: main is told once the worker has stayed out of `running` for all of it.

// Long enough for a background task to finish and wake the worker, short enough that a worker that
// died is noticed while its card is still fresh. Only for a stop that does not say what it waits on.
export const STOP_GRACE_MS = 3 * 60 * 1000;

// A worker's report reaches main a moment before or after its Stop hook does, and main counts it only
// once it reads it. Long enough for an idle main to read it, short enough to still be at once.
export const REPORT_SETTLE_MS = 10 * 1000;

export type StopNoticePorts = {
  // Runs `run` once after `ms`, unless the answer is called first. A real timer unless a test moves
  // its own clock.
  after?(ms: number, run: () => void): () => void;
  // The worker stopped for good and nothing reported its stop.
  notice(id: string): void;
};

export type StopNotices = {
  // What the worker's hooks said, as `session notify` hears it, with what a Stop hook said it waits
  // on when it said so.
  state(id: string, state: WorkerState, waiting?: StopWaiting): void;
  // The worker sent main a report: the stop it ends its turn with needs no notice.
  reported(id: string): void;
  // The pane is no longer that worker's, or it was run again.
  forget(id: string): void;
};

function after(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

export function stopNotices(ports: StopNoticePorts, graceMs = STOP_GRACE_MS, settleMs = REPORT_SETTLE_MS): StopNotices {
  const wait = ports.after ?? after;
  // Per pane, the grace period or settle now running, which a return to work or a report calls off.
  const pending = new Map<string, () => void>();
  // A report heard while the worker was not stopped: it covers the stop its turn ends with next. One
  // heard after a stop that was already noticed covers nothing, since no stop is still ahead of it.
  const reports = new Set<string>();
  // Out of `running` since its turn last ended.
  const stopped = new Set<string>();
  // Noticed already and not at work since: a turn ending again without the worker running in between
  // is the same stop, not a new one.
  const noticed = new Set<string>();

  function callOff(id: string): boolean {
    const cancel = pending.get(id);
    pending.delete(id);
    cancel?.();
    return cancel !== undefined;
  }

  return {
    state(id, state, waiting) {
      // Back at work, or a second turn end before the first was noticed, which means the worker
      // woke and worked in between: either way this one decides again.
      callOff(id);
      if (state !== 'done') {
        noticed.delete(id);
        stopped.delete(id);
        return;
      }
      // A pause is not the stop a report ends with, so a report heard before it still covers the
      // stop after the work it waits on.
      if (isPaused(waiting)) {
        stopped.delete(id);
        return;
      }
      stopped.add(id);
      if (reports.delete(id) || noticed.has(id)) return;
      pending.set(id, wait(waiting === undefined ? graceMs : settleMs, () => {
        pending.delete(id);
        noticed.add(id);
        ports.notice(id);
      }));
    },
    reported(id) {
      // A report arriving after the stop, as one does when main reads it only after its own turn.
      if (!callOff(id) && !stopped.has(id)) reports.add(id);
    },
    forget(id) {
      callOff(id);
      reports.delete(id);
      noticed.delete(id);
      stopped.delete(id);
    },
  };
}
