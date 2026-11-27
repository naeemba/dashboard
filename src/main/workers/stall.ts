// Whether a worker at work has gone silent (workers-decision-13). Its sign of life is a hook: a
// prompt going in, a tool finishing, a stop. A worker hung on a test that never ends runs no hook, so
// it sits in Doing holding its pool slot. Pane output is no sign: Claude Code's spinner redraws its
// timer every second whatever the worker is stuck on. Stalled is only shown and told, once: the worker
// keeps its pane and its slot, and the user or main decides what becomes of it.

const MINUTE_MS = 60_000;

// The whole minutes since the last sign, once they reach the setting; null before.
export function silentMinutes(lastSign: number, now: number, stallMinutes: number): number | null {
  const silent = Math.floor((now - lastSign) / MINUTE_MS);
  return silent >= stallMinutes ? silent : null;
}

export type StallWatch = {
  // A hook heard from the worker: its clock starts again, and a stall after this one is told again.
  sign(id: string): void;
  // How long the worker has been silent, when that is a stall. The first look at a worker no hook has
  // spoken for since the launch (one resumed after a restart) starts its clock there.
  silentFor(id: string): number | null;
  // Whether main is yet to be told of the worker's stall, asked once silentFor says it is one: true
  // once per stall.
  tellNow(id: string): boolean;
  forget(id: string): void;
};

export function stallWatch(stallMinutes: () => number, now: () => number = Date.now): StallWatch {
  const signs = new Map<string, number>();
  const told = new Set<string>();
  const silentFor = (id: string): number | null => {
    const last = signs.get(id) ?? now();
    signs.set(id, last);
    return silentMinutes(last, now(), stallMinutes());
  };
  return {
    sign(id) {
      signs.set(id, now());
      told.delete(id);
    },
    silentFor,
    tellNow(id) {
      if (told.has(id)) return false;
      told.add(id);
      return true;
    },
    forget(id) {
      signs.delete(id);
      told.delete(id);
    },
  };
}

// What `pane list` and `pane status` say of the worker in place of `running`.
export const stalledState = (minutes: number) => `stalled, silent ${minutes} minutes`;
