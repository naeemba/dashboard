// Whether a worker at work has gone silent (workers-decision-13). Its sign of life is a hook: a
// prompt going in, a tool finishing, a stop. A worker hung on a test that never ends runs no hook, so
// it sits in Doing holding its pool slot. Pane output is no sign: Claude Code's spinner redraws its
// timer every second whatever the worker is stuck on. Stalled is only shown and told, once: the worker
// keeps its pane and its slot, and the user or main decides what becomes of it.

const MINUTE_MS = 60_000;
// How often main's workers are looked at for a stall: a stall is told within a minute of it.
export const STALL_SWEEP_MS = MINUTE_MS;

// The whole minutes since the last sign, once they reach the setting; null before.
export function silentMinutes(lastSign: number, now: number, stallMinutes: number): number | null {
  const silent = Math.floor((now - lastSign) / MINUTE_MS);
  return silent >= stallMinutes ? silent : null;
}

export type StallWatch = {
  // A hook heard from the worker: its clock starts again, a notice of its stall still waiting for main
  // is taken back, and a stall after this one is told again.
  sign(id: string): void;
  // How long the worker has been silent, when that is a stall. A worker no hook has spoken for since
  // the launch (one resumed after a restart) has no clock, so it is never one.
  silentFor(id: string): number | null;
  // Tells main of the worker's stall, asked once silentFor says it is one: once per stall. `send`
  // answers with what takes the notice back.
  tell(id: string, send: () => () => void): void;
  forget(id: string): void;
};

export function stallWatch(stallMinutes: () => number, now: () => number = Date.now): StallWatch {
  const signs = new Map<string, number>();
  // The stalls told, each with what takes its notice back.
  const told = new Map<string, () => void>();
  const takeBack = (id: string) => {
    told.get(id)?.();
    told.delete(id);
  };
  return {
    sign(id) {
      signs.set(id, now());
      takeBack(id);
    },
    silentFor(id) {
      const last = signs.get(id);
      return last === undefined ? null : silentMinutes(last, now(), stallMinutes());
    },
    tell(id, send) {
      if (!told.has(id)) told.set(id, send());
    },
    forget(id) {
      signs.delete(id);
      takeBack(id);
    },
  };
}

// Whether this sweep redraws the workers popup: while a worker is stalled, since a stall begins, and
// its minutes move on, with no hook to mark it; and once on the sweep after the last one ends, which a
// hook usually marks first but a raised `workers.stallMinutes` does not.
export function stallRedraws(): (stalled: boolean) => boolean {
  let stalledLastSweep = false;
  return (stalled) => {
    const redraw = stalled || stalledLastSweep;
    stalledLastSweep = stalled;
    return redraw;
  };
}

// What `pane list` and `pane status` say of the worker in place of `running`.
export const stalledState = (minutes: number) => `stalled, silent ${minutes} minutes`;
