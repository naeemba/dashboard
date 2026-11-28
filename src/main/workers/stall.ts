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
// How many workers silent at once, with nothing else answering either, is the machine gone quiet
// rather than workers stuck: one stuck worker with main idle is still that worker's own notice.
const MACHINE_STALLS = 2;

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
  mainOf(id: string): number;
  // Each answers with what takes its notice back.
  tellPane(id: string, stall: Stall): () => void;
  tellMachine(slot: number, since: number): () => void;
};

export type StallWatch = {
  // A hook heard from the worker: its clock starts again, a notice of its stall still waiting for main
  // is taken back, and a stall after this one is told again. A tool hook's call is kept while it runs.
  sign(id: string, told?: Pick<HookTold, 'toolStarted' | 'toolEnded'>): void;
  // Anything on the machine answered: a session command, a main's turn starting or ending, or a sign.
  // A notice that nothing had is taken back.
  answered(): void;
  // How long the worker has been silent, when that is a stall. A worker no hook has spoken for since
  // the launch (one resumed after a restart) has no clock, so it is never one.
  silentFor(id: string): Stall | null;
  // Tells main of each stall once. When two or more are silent and nothing else has answered for the
  // setting's minutes either, each main hears that once instead, and the stalls wait until something
  // answers again: a machine asleep or frozen woke to one warning per pane, delivered at once.
  // Answers whether any worker is stalled now, told or not.
  sweep(ports: StallSweepPorts): boolean;
  forget(id: string): void;
};

export function stallWatch(stallMinutes: () => number, now: () => number = Date.now): StallWatch {
  const signs = new Map<string, number>();
  // The tool call each worker is in, with when it started; the last one started, so of calls run side
  // by side the one finishing first leaves the other unnamed, and a call refused before it ran is kept
  // only until the next hook.
  const calls = new Map<string, ToolCall & { since: number }>();
  // The stalls told, each with what takes its notice back; and the mains told the machine is silent.
  const told = new Map<string, () => void>();
  const machineTold = new Map<number, () => void>();
  let lastAnswer = now();
  const takeBack = (id: string) => {
    told.get(id)?.();
    told.delete(id);
  };

  function answered(): void {
    lastAnswer = now();
    for (const withdraw of machineTold.values()) withdraw();
    machineTold.clear();
  }

  function silentFor(id: string): Stall | null {
    const last = signs.get(id);
    if (last === undefined) return null;
    const call = calls.get(id);
    const minutes = silentMinutes(last, now(), call === undefined ? stallMinutes() : Math.max(stallMinutes(), TOOL_CEILING_MINUTES));
    if (minutes === null) return null;
    return call === undefined ? { minutes } : { minutes, tool: { name: call.name, about: call.about, minutes: wholeMinutes(now() - call.since) } };
  }

  return {
    sign(id, { toolStarted, toolEnded } = {}) {
      signs.set(id, now());
      takeBack(id);
      answered();
      if (toolStarted !== undefined) calls.set(id, { ...toolStarted, since: now() });
      else if (toolEnded === undefined || calls.get(id)?.id === toolEnded) calls.delete(id);
    },
    answered,
    silentFor,
    sweep(ports) {
      const stalled = ports.panes().flatMap((id) => {
        const stall = ports.silentAtWork(id);
        return stall === null ? [] : [{ id, stall }];
      });
      const machineSilent = stalled.length >= MACHINE_STALLS && silentMinutes(lastAnswer, now(), stallMinutes()) !== null;
      for (const { id, stall } of stalled) {
        if (ports.fromUser(id)) continue;
        const slot = ports.mainOf(id);
        if (machineSilent) {
          if (!machineTold.has(slot)) machineTold.set(slot, ports.tellMachine(slot, lastAnswer));
        } else if (!told.has(id)) told.set(id, ports.tellPane(id, stall));
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
