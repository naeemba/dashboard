import { describe, expect, it } from 'vitest';
import { paneKey, type Survivor } from '../../panes/pane-host-protocol';
import { bind } from '../action';
import { paneReap } from './reap';

function survivor(projectPath: string, index: number, unit?: string): Survivor {
  return { key: paneKey(projectPath, index), pid: 1, file: 'zsh', args: [], cwd: projectPath, cols: 80, rows: 24, foreground: 'zsh', screen: '', unit };
}

// `session` is the projects the restored session named.
function reaping(unclaimed: Survivor[], session: string[] = [], stopScope: (unit: string) => Promise<void> = async () => undefined) {
  const done: string[] = [];
  const keptBack: Survivor[] = [];
  const reap = bind(paneReap, {
    unclaimed: () => unclaimed.splice(0),
    keep: (survivors) => { keptBack.push(...survivors); },
    inSession: (projectPath) => session.includes(projectPath),
    killKept: (key) => { done.push(`kill ${key}`); },
    stopScope: async (unit) => { done.push(`stop ${unit}`); await stopScope(unit); },
    log: (draft) => { done.push(`${draft.level} ${draft.message}`); },
  });
  return { reap, done, keptBack };
}

describe('pane.reap', () => {
  it('kills every kept shell of a project the session never named, then stops its scope, and says how many', async () => {
    const { reap, done } = reaping([survivor('/work/api', 1, 'agent-api-1.scope'), survivor('/work/api', -1), survivor('/work/web', 2)]);
    const output = 'Ended the shells kept for projects not in the session: 2 in /work/api, 1 in /work/web';
    expect(await reap.call({})).toEqual({ output });
    expect(done).toEqual([
      `kill ${paneKey('/work/api', 1)}`, 'stop agent-api-1.scope', `kill ${paneKey('/work/api', -1)}`, `kill ${paneKey('/work/web', 2)}`,
      `info ${output}`,
    ]);
  });

  // A folder on a disk not mounted yet, or an open that threw: a worker may be mid-turn in there.
  it('keeps the shells of a project the session named that did not open, for its open, and says so', async () => {
    const worker = survivor('/mnt/disk/api', 2, 'agent-api-2.scope');
    const { reap, done, keptBack } = reaping([worker, survivor('/work/old', 1)], ['/mnt/disk/api']);
    const { output } = await reap.call({}) as { output: string };
    expect(keptBack).toEqual([worker]);
    expect(done).not.toContain(`kill ${worker.key}`);
    expect(done).not.toContain('stop agent-api-2.scope');
    expect(done).toContain(`kill ${paneKey('/work/old', 1)}`);
    expect(output).toContain('Kept the shells of projects that did not reopen, until they open: 1 in /mnt/disk/api');
  });

  it('says nothing when every kept shell was taken back', async () => {
    const { reap, done } = reaping([]);
    expect(await reap.call({})).toEqual({ output: '' });
    expect(done).toEqual([]);
  });

  it('logs a scope it could not stop, and ends the rest all the same', async () => {
    const { reap, done } = reaping([survivor('/work/api', 1, 'agent-api-1.scope')], [], async () => { throw new Error('timed out'); });
    await reap.call({});
    expect(done).toContain('warn agent-api-1.scope was not stopped: timed out');
  });
});
