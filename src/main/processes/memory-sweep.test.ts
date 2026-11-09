import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import type { MemorySnapshot } from '../../shared/processes/scope-memory';
import { memorySweep, readMemory, recordedUnits, runningUnits, userServiceCgroup } from './memory-sweep';

const AGENT_HIGH = 6 * 1024 ** 3;

// A user service's cgroup folder with these scopes in it, each holding the bytes given under its cap
// (memory.high's `max` for none).
function cgroups(scopes: Record<string, [number, number | 'max']>): string {
  const root = temporaryFolder('memory-sweep-');
  for (const [where, [bytes, high]] of Object.entries(scopes)) {
    mkdirSync(path.join(root, where), { recursive: true });
    writeFileSync(path.join(root, where, 'memory.current'), `${bytes}\n`);
    writeFileSync(path.join(root, where, 'memory.high'), `${high}\n`);
  }
  return root;
}

describe('userServiceCgroup', () => {
  it('is the user manager’s folder under the user’s slice', () => {
    expect(userServiceCgroup(1000)).toBe('/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service');
  });
});

describe('readMemory', () => {
  it('reads each scope under its own slice, with the cap the kernel holds it to', async () => {
    const root = cgroups({ 'agents.slice/agent-shop-3-k4f2.scope': [2048, AGENT_HIGH], 'panes.slice/pane-shop-1-a1b2.scope': [1024, 'max'] });
    expect(await readMemory(root, [['3:3', 'agent-shop-3-k4f2.scope'], ['3:1', 'pane-shop-1-a1b2.scope']])).toEqual({
      '3:3': { bytes: 2048, high: AGENT_HIGH },
      '3:1': { bytes: 1024, high: null },
    });
  });

  it('adds a worker screen’s shell and session up under its pane, keeping the session’s cap', async () => {
    const root = cgroups({ 'panes.slice/pane-shop-2-a1b2.scope': [1000, 'max'], 'agents.slice/agent-worker-x9q0.scope': [5000, AGENT_HIGH] });
    expect(await readMemory(root, [['3:2', 'pane-shop-2-a1b2.scope'], ['3:2', 'agent-worker-x9q0.scope']])).toEqual({
      '3:2': { bytes: 6000, high: AGENT_HIGH },
    });
  });

  it('leaves out a scope that has ended and a name it never handed out', async () => {
    const root = cgroups({});
    expect(await readMemory(root, [['3:1', 'pane-shop-1-gone.scope'], ['3:2', 'app-dashboard-12.scope']])).toEqual({});
  });
});

describe('recordedUnits', () => {
  const paneOf = (key: number) => (key === 1_000_002 ? '3:2' : undefined);

  it('puts a worker screen’s session on its pane and a page’s main on the page’s main', () => {
    expect(recordedUnits([['3:1', 'pane-a']], [[1_000_002, 'agent-w'], [3, 'agent-main']], paneOf, () => true))
      .toEqual([['3:1', 'pane-a'], ['3:2', 'agent-w'], ['3:0', 'agent-main']]);
  });

  it('keeps only open projects', () => {
    expect(recordedUnits([['3:1', 'pane-a'], ['4:1', 'pane-b']], [[4, 'agent-main']], paneOf, (slot) => slot === 3))
      .toEqual([['3:1', 'pane-a']]);
  });
});

describe('runningUnits', () => {
  it('leaves out a session with no unit and one whose start failed', async () => {
    const sessions: [number, Promise<{ unit: string | null }>][] = [
      [1, Promise.resolve({ unit: 'agent-a.scope' })], [2, Promise.resolve({ unit: null })], [3, Promise.reject(new Error('no claude'))],
    ];
    expect(await runningUnits(sessions)).toEqual([[1, 'agent-a.scope']]);
  });
});

describe('memorySweep', () => {
  // A sweep over one scope, with its ticks run by hand. Each tick waits for the next to be scheduled.
  function sweep(root: string, units: () => Promise<[string, string][]>, platform: NodeJS.Platform = 'linux') {
    const published: MemorySnapshot[] = [];
    const failures: unknown[] = [];
    let next: (() => void) | undefined;
    let scheduled: () => void = () => undefined;
    const later = (tick: () => void): void => { next = tick; scheduled(); };
    const ticked = (): Promise<void> => new Promise((resolve) => { scheduled = resolve; });
    const first = ticked();
    const latest = memorySweep({ root, units, publish: (snapshot) => published.push(snapshot), sweepFailed: (error) => failures.push(error) }, platform, later);
    const tick = async (): Promise<void> => { const done = ticked(); next?.(); await done; };
    return { published, failures, latest, first, tick };
  }

  it('publishes a reading once, not again while nothing on screen moved, and answers the first read with it', async () => {
    const root = cgroups({ 'panes.slice/pane-shop-1-a1b2.scope': [1024, 'max'] });
    const run = sweep(root, async () => [['3:1', 'pane-shop-1-a1b2.scope']]);
    await run.first;
    await run.tick();
    expect(run.published).toEqual([{ '3:1': { bytes: 1024, high: null } }]);
    expect(run.latest()).toEqual({ '3:1': { bytes: 1024, high: null } });
  });

  it('holds a sweep that threw and still sweeps again', async () => {
    let calls = 0;
    const run = sweep(cgroups({}), async () => { calls += 1; throw new Error('bad id'); });
    await run.first;
    await run.tick();
    expect(run.failures).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it('reads nothing off Linux', () => {
    let calls = 0;
    const run = sweep(cgroups({}), async () => { calls += 1; return []; }, 'darwin');
    expect(calls).toBe(0);
    expect(run.latest()).toEqual({});
  });
});
