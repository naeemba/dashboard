import type { WorkerState } from '../../shared/app/bridge';

// When main hears that a worker it dispatched has stopped. A worker's turn ends whenever it waits on
// its own background work — a review subagent, CI, a loop — and wakes again when that work reports, so
// a notice per turn end gave main dozens per card, each a turn spent saying "still waiting". Main is
// told only once the worker has stayed out of `running` for the whole grace period, once per stop,
// and not at all for a stop its own report already covers (workers-decision-1).

// Long enough for a background task to finish and wake the worker, short enough that a worker that
// died is noticed while its card is still fresh.
export const STOP_GRACE_MS = 3 * 60 * 1000;

export type StopNoticePorts = {
  // Runs `run` once after `ms`, unless the answer is called first.
  after(ms: number, run: () => void): () => void;
  // The grace period passed with the worker still stopped and unreported.
  notice(id: string): void;
};

export type StopNotices = {
  // What the worker's hooks said, as `session notify` hears it.
  state(id: string, state: WorkerState): void;
  // The worker sent main a report: the stop it ends its turn with needs no notice.
  reported(id: string): void;
  // The pane is no longer that worker's, or it was run again.
  forget(id: string): void;
};

export function stopNotices(ports: StopNoticePorts, graceMs = STOP_GRACE_MS): StopNotices {
  // Per pane, the grace period now running, which a return to work or a report calls off.
  const pending = new Map<string, () => void>();
  // A report heard with no stop pending: it covers the stop the worker's turn ends with next.
  const reports = new Set<string>();
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
    state(id, state) {
      if (state !== 'done') {
        callOff(id);
        noticed.delete(id);
        return;
      }
      if (reports.delete(id) || noticed.has(id)) return;
      // A second turn end inside the grace period means the worker woke and worked in between, so the
      // period starts again from this one.
      callOff(id);
      pending.set(id, ports.after(graceMs, () => {
        pending.delete(id);
        noticed.add(id);
        ports.notice(id);
      }));
    },
    reported(id) {
      // A report arriving after the stop, as one does when main reads it only after its own turn.
      if (!callOff(id)) reports.add(id);
    },
    forget(id) {
      callOff(id);
      reports.delete(id);
      noticed.delete(id);
    },
  };
}
