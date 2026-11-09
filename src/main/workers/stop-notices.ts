import type { WorkerState } from '../../shared/app/bridge';
import { PAUSE_CEILING_MS } from '../../shared/workers/done-report';
import { isPaused, type StopWaiting } from '../../shared/workers/worker-roster';

// When main hears that a worker it dispatched has stopped. A worker's turn ends whenever it waits on
// its own background work — a review subagent, CI, a loop — and wakes again when that work reports, so
// a notice per turn end gave main dozens per card, each a turn spent saying "still waiting". Claude
// Code's Stop hook says which it is: what is still in flight and what is scheduled to wake it
// (StopWaiting). Nothing in either is the worker done, and main is told within REPORT_SETTLE_MS;
// anything in either is a pause, and nobody is told until a later stop finds both empty, or until
// PAUSE_CEILING_MS for a pause nothing ever wakes. Once per stop, and not at all for a stop the
// worker's own report already covers. A notice due while main is mid-turn waits for that turn to end,
// so a report the turn read drops it; one main reads only after the notice was queued takes it back
// (workers-decision-1).
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
  // The worker stopped for good and nothing reported its stop, or, `paused`, it has waited on its own
  // background work for the whole ceiling. Answers with a way to take the notice back, if it can be,
  // for a report main reads only after it was queued.
  notice(id: string, paused: boolean): (() => void) | void;
  // Whether the main the worker's notice goes to is mid-turn. A notice due then is held until that
  // turn ends: queued, main takes it the moment the turn ends, before the app has read whether the
  // turn read the worker's report, and it can no longer be taken back.
  midTurn(id: string): boolean;
};

export type StopNotices = {
  // What the worker's hooks said, as `session notify` hears it, with what a Stop hook said it waits
  // on when it said so.
  state(id: string, state: WorkerState, waiting?: StopWaiting): void;
  // The worker sent main a report: the stop it ends its turn with needs no notice.
  reported(id: string): void;
  // The pane is no longer that worker's — released, closed, or run again — and a notice about it that
  // still waits in main's queue is taken back: main reads a report only when its turn ends, and the
  // turn that read it is usually the one that merged and released the worker.
  forget(id: string): void;
  // A main's turn ended, after its result was read: each notice held for a worker whose main is no
  // longer mid-turn, and not dropped by a report that turn read, is told now.
  turnOver(): void;
};

function after(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

export function stopNotices(
  ports: StopNoticePorts, graceMs = STOP_GRACE_MS, settleMs = REPORT_SETTLE_MS, ceilingMs = PAUSE_CEILING_MS,
): StopNotices {
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
  // Told it is paused and not at work since: the same pause is not told twice, but the stop after it
  // still is, since main heard only that the worker waits.
  const pauseNoticed = new Set<string>();
  // How to take back the notice of the stop the worker is in now, until it works again.
  const takeBacks = new Map<string, () => void>();
  // Due while the worker's main was mid-turn, each with whether it is the pause's notice.
  const held = new Map<string, boolean>();

  function callOff(id: string): void {
    pending.get(id)?.();
    pending.delete(id);
  }

  function takeBack(id: string): void {
    takeBacks.get(id)?.();
    takeBacks.delete(id);
  }

  function say(id: string, paused: boolean): void {
    const withdraw = ports.notice(id, paused);
    if (withdraw) takeBacks.set(id, withdraw);
  }

  function tell(id: string, ms: number, paused = false) {
    // A pause still held is not news once a later stop is the one to tell.
    held.delete(id);
    pending.set(id, wait(ms, () => {
      pending.delete(id);
      (paused ? pauseNoticed : noticed).add(id);
      if (ports.midTurn(id)) held.set(id, paused);
      else say(id, paused);
    }));
  }

  return {
    state(id, state, waiting) {
      // Back at work, or a second turn end before the first was noticed, which means the worker
      // woke and worked in between: either way this one decides again.
      callOff(id);
      if (state !== 'done') {
        held.delete(id);
        noticed.delete(id);
        pauseNoticed.delete(id);
        stopped.delete(id);
        takeBacks.delete(id);
        return;
      }
      // A pause is not the stop a report ends with, so a report heard before it still covers the
      // stop after the work it waits on, and one heard during it calls off the ceiling.
      if (isPaused(waiting)) {
        stopped.delete(id);
        if (!reports.has(id) && !noticed.has(id) && !pauseNoticed.has(id)) tell(id, ceilingMs, true);
        return;
      }
      stopped.add(id);
      if (reports.delete(id) || noticed.has(id)) return;
      tell(id, waiting === undefined ? graceMs : settleMs);
    },
    reported(id) {
      // A report arriving after the stop, as one does when main reads it only after its own turn:
      // its notice is called off, or taken back if it was already queued.
      callOff(id);
      takeBack(id);
      held.delete(id);
      if (!stopped.has(id)) reports.add(id);
    },
    forget(id) {
      callOff(id);
      takeBack(id);
      held.delete(id);
      reports.delete(id);
      noticed.delete(id);
      pauseNoticed.delete(id);
      stopped.delete(id);
    },
    turnOver() {
      for (const [id, paused] of held) {
        if (ports.midTurn(id)) continue;
        held.delete(id);
        say(id, paused);
      }
    },
  };
}
