import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MAIN_INDEX, paneFromId, terminalId } from '../../shared/panes/terminals';
import type { MemorySnapshot } from '../../shared/processes/scope-memory';
import { scopeLimits } from './scope';

// The memory each recorded scope holds, read from its memory.current every few seconds and handed to
// the window by terminal id. One small file per scope; a scope that has ended, or that a pane host
// from an older build never started, has no file and is left out. docs/processes/README.md.

export const MEMORY_SWEEP_MS = 5_000;

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

// `units` is every scope recorded for an open project's panes and sessions, by terminal id: a pane
// can have two (a worker screen's shell and its session), and they are added up.
export async function readMemory(root: string, units: Iterable<[string, string]>): Promise<MemorySnapshot> {
  const snapshot: MemorySnapshot = {};
  await Promise.all([...units].map(async ([id, unit]) => {
    const limits = scopeLimits(unit);
    if (limits === null) return;
    let bytes: number;
    try {
      bytes = Number((await readFile(path.join(root, limits.slice, unit, 'memory.current'), 'utf8')).trim());
    } catch {
      return;
    }
    if (!Number.isFinite(bytes)) return;
    const before = snapshot[id];
    snapshot[id] = { bytes: (before?.bytes ?? 0) + bytes, high: before?.high ?? limits.high };
  }));
  return snapshot;
}

// The sweep: nothing at all off Linux, where no scope is ever recorded.
export function memorySweep(ports: { root: string; units(): Promise<[string, string][]>; publish(snapshot: MemorySnapshot): void }): void {
  if (process.platform !== 'linux') return;
  let sweeping = false;
  setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    ports.units().then((units) => readMemory(ports.root, units)).then(ports.publish, () => undefined).finally(() => { sweeping = false; });
  }, MEMORY_SWEEP_MS).unref();
}
