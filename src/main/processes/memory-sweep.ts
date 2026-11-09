import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MAIN_INDEX, paneFromId, terminalId } from '../../shared/panes/terminals';
import { drawnMemory, type MemorySnapshot } from '../../shared/processes/scope-memory';
import { sliceOf } from './scope';

// The memory each recorded scope holds, read from its memory.current every few seconds and handed to
// the window by terminal id. Two small files per scope (memory.current and memory.high); a scope that has ended, or that a pane host
// from an older build never started, has no file and is left out. docs/processes/README.md.

const MEMORY_SWEEP_MS = 5_000;

// Where the user's manager keeps its cgroups: `user@<uid>.service` under the user's slice.
export function userServiceCgroup(uid: number): string {
  return `/sys/fs/cgroup/user.slice/user-${uid}.slice/user@${uid}.service`;
}

// Every recorded scope of an open project, by the terminal id the window draws it on: a pane's shell
// under its own id, a worker screen's session under its pane's, a page's main session under the page's
// main (`<slot>:0`). `paneOf` is the worker screen running under a session's key, if any.
export function recordedUnits(
  paneUnits: Iterable<[string, string]>, sessionUnits: Iterable<[number, string]>,
  paneOf: (key: number) => string | undefined, isOpen: (slot: number) => boolean,
): [string, string][] {
  const sessions = [...sessionUnits].map(([key, unit]): [string, string] => [paneOf(key) ?? terminalId(key, MAIN_INDEX), unit]);
  return [...paneUnits, ...sessions].filter(([id]) => isOpen(paneFromId(id).slot));
}

// The scope of every session running now, by slot or screen key. One with no unit (unscoped, or
// kept by a screen host from before units were sent) and one whose start failed are left out.
export async function runningUnits(sessions: Iterable<[number, Promise<{ unit: string | null }>]>): Promise<[number, string][]> {
  const running = await Promise.all([...sessions].map(async ([key, session]) => [key, (await session.catch(() => null))?.unit] as const));
  return running.filter((entry): entry is [number, string] => entry[1] != null);
}

// `units` is every scope recorded for an open project's panes and sessions, by terminal id: a pane
// can have two (a worker screen's shell and its session), and they are added up.
export async function readMemory(root: string, units: Iterable<[string, string]>): Promise<MemorySnapshot> {
  const snapshot: MemorySnapshot = {};
  await Promise.all([...units].map(async ([id, unit]) => {
    const slice = sliceOf(unit);
    if (slice === null) return;
    const folder = path.join(root, slice, unit);
    let bytes: number;
    let high: number | null;
    try {
      // memory.high is the cap the kernel holds the scope to now, `max` for none.
      const [current, cap] = await Promise.all(['memory.current', 'memory.high'].map(async (file) => (await readFile(path.join(folder, file), 'utf8')).trim()));
      bytes = Number(current);
      high = cap === 'max' ? null : Number(cap);
    } catch {
      return;
    }
    if (!Number.isFinite(bytes)) return;
    const before = snapshot[id];
    snapshot[id] = { bytes: (before?.bytes ?? 0) + bytes, high: before?.high ?? (Number.isFinite(high) ? high : null) };
  }));
  return snapshot;
}

export type MemorySweepPorts = {
  root: string;
  units(): Promise<[string, string][]>;
  // Tell the window. Called only for a sweep that moved something on screen.
  publish(snapshot: MemorySnapshot): void;
  // A sweep that threw, held on the bar the way the token sweep's is (main.ts).
  sweepFailed(error: unknown): void;
};

function sweepLater(tick: () => void): void {
  setTimeout(tick, MEMORY_SWEEP_MS).unref();
}

// The sweep: nothing at all off Linux, where no scope is ever recorded. Published only when what the
// window draws of it changed, so an idle machine sends nothing; what it returns is the window's first read,
// so a window that opens after the last change still has every figure. A test passes its own platform
// and runs `later`'s tick by hand.
export function memorySweep(ports: MemorySweepPorts, platform: NodeJS.Platform = process.platform, later = sweepLater): () => MemorySnapshot {
  let latest: MemorySnapshot = {};
  if (platform !== 'linux') return () => latest;
  let drawn = drawnMemory(latest);
  const tick = (): Promise<void> => ports.units().then((units) => readMemory(ports.root, units)).then((snapshot) => {
    latest = snapshot;
    const next = drawnMemory(snapshot);
    if (next === drawn) return;
    drawn = next;
    ports.publish(snapshot);
  }).catch(ports.sweepFailed).finally(() => { later(() => void tick()); });
  void tick();
  return () => latest;
}
