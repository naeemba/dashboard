import { PAUSE_CEILING_MS, type ToolRunning } from '../../shared/workers/done-report';
import type { HookTold, ToolCall } from './session-cli';

// Whether a worker at work has gone silent (workers-decision-13). Its sign of life is a hook: a
// prompt going in, a tool starting or finishing, a stop. A worker hung on a test that never ends runs
// no hook, so it sits in Doing holding its pool slot. Pane output is no sign: Claude Code's spinner
// redraws its timer every second whatever the worker is stuck on. Stalled is only shown and told, once:
// the worker keeps its pane and its slot, and the user or main decides what becomes of it.

const MINUTE_MS = 60_000;
// How often main's workers are looked at for a stall: a stall is told within a minute of it.
export const STALL_SWEEP_MS = MINUTE_MS;
// A worker silent inside a tool call waits on its own work, a long check or a review loop's wait,
// which looks the same as a test that never ends: it is stalled only past the pause ceiling, as a
// pause is told, and its notice names the call.
const TOOL_CEILING_MINUTES = PAUSE_CEILING_MS / MINUTE_MS;
// A look at the clocks (a sweep, a read, a hook) this long after the one before it is the machine come
// back: setInterval does not fire while it sleeps or while the main process is blocked, so the time
// between is the machine's silence, not the workers', and is not counted.
const AWAY_MS = 2 * STALL_SWEEP_MS;

const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE_MS);

// The whole minutes since the last sign, once they reach the setting; null before.
export function silentMinutes(lastSign: number, now: number, stallMinutes: number): number | null {
  const silent = wholeMinutes(now - lastSign);
  return silent >= stallMinutes ? silent : null;
}

// A stall: how long the worker has been silent, and the tool call still running in it when one is.
export type Stall = { minutes: number; tool?: ToolRunning };

// What one sweep asks of the workers and how it tells main (session-requests.ts's tellStalls).
export type StallSweepPorts = {
  panes(): readonly string[];
  // How long the pane's worker has been silent, when that is a stall of main's worker at work.
  silentAtWork(id: string): Stall | null;
  // A turn you typed into the worker yourself, which you are watching: listed stalled, never told.
  fromUser(id: string): boolean;
  // Answers with what takes its notice back.
  tellPane(id: string, stall: Stall): () => void;
};

export type StallWatch = {
  // A hook heard from the worker: its clock starts again, a notice of its stall still waiting for main
  // is taken back, and a stall after this one is told again. A tool hook's call is kept while it runs.
  sign(id: string, told?: Pick<HookTold, 'toolStarted' | 'toolEnded'>): void;
  // How long the worker has been silent, when that is a stall. A worker no hook has spoken for since
  // the launch (one resumed after a restart) has no clock, so it is never one.
  silentFor(id: string): Stall | null;
  // Tells main of each stall once. Answers whether any worker is stalled now, told or not. Each of
  // these first moves every clock on by the time the machine was away, whichever comes first after it
  // wakes, so a silence counts awake minutes only: a machine asleep or frozen woke to one warning per
  // pane, delivered at once, and `pane list` read before the next sweep showed the sleep as silence.
  sweep(ports: StallSweepPorts): boolean;
  forget(id: string): void;
};

type RunningCall = ToolCall & { since: number };

export function stallWatch(stallMinutes: () => number, now: () => number = Date.now): StallWatch {
  const signs = new Map<string, number>();
  // The tool calls each worker is in, by id, each with when it started, oldest first; a call refused
  // before it ran is kept only until the next hook that is not a tool's.
  const calls = new Map<string, Map<string, RunningCall>>();
  // The stalls told, each with what takes its notice back.
  const told = new Map<string, () => void>();
  let lastLook = now();
  const catchUp = () => {
    const gap = now() - lastLook;
    lastLook = now();
    if (gap <= AWAY_MS) return;
    // A hook heard after the machine came back, before this look, is not moved past now.
    const later = (time: number) => Math.min(time + gap - STALL_SWEEP_MS, now());
    for (const [id, time] of signs) signs.set(id, later(time));
    for (const running of calls.values()) for (const call of running.values()) call.since = later(call.since);
  };
  const takeBack = (id: string) => {
    told.get(id)?.();
    told.delete(id);
  };

  function silentFor(id: string): Stall | null {
    catchUp();
    const last = signs.get(id);
    if (last === undefined) return null;
    const call = calls.get(id)?.values().next().value;
    const minutes = silentMinutes(last, now(), call === undefined ? stallMinutes() : Math.max(stallMinutes(), TOOL_CEILING_MINUTES));
    if (minutes === null) return null;
    return call === undefined ? { minutes } : { minutes, tool: { name: call.name, about: call.about, minutes: wholeMinutes(now() - call.since) } };
  }

  return {
    sign(id, { toolStarted, toolEnded } = {}) {
      catchUp();
      signs.set(id, now());
      takeBack(id);
      const running = calls.get(id) ?? new Map<string, RunningCall>();
      if (toolStarted !== undefined) calls.set(id, running.set(toolStarted.id, { ...toolStarted, since: now() }));
      else if (toolEnded !== undefined) running.delete(toolEnded);
      else calls.delete(id);
    },
    silentFor,
    sweep(ports) {
      catchUp();
      const stalled = ports.panes().flatMap((id) => {
        const stall = ports.silentAtWork(id);
        return stall === null ? [] : [{ id, stall }];
      });
      for (const { id, stall } of stalled) {
        if (!ports.fromUser(id) && !told.has(id)) told.set(id, ports.tellPane(id, stall));
      }
      return stalled.length > 0;
    },
    forget(id) {
      signs.delete(id);
      calls.delete(id);
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
export const stalledState = ({ minutes, tool }: Stall) => `stalled, silent ${minutes} minutes`
  + (tool === undefined ? '' : `, ${tool.name} running ${tool.minutes} minutes`);
