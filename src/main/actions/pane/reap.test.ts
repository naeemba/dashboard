import { describe, expect, it } from 'vitest';
import { paneKey, type Survivor } from '../../panes/pane-host-protocol';
import type { PaneShell } from '../../panes/pane-shell';
import { bind } from '../action';
import { paneReap } from './reap';

function survivor(projectPath: string, index: number, unit?: string): Survivor {
  return { key: paneKey(projectPath, index), pid: 1, file: 'zsh', args: [], cwd: projectPath, cols: 80, rows: 24, foreground: 'zsh', screen: '', unit };
}

function ending(kept: Survivor[], stopScope: (unit: string) => Promise<void> = async () => undefined) {
  const done: string[] = [];
  const end = bind(paneReap, {
    unclaimed: () => kept.splice(0).map((each) => ({ survivor: each, shell: { kill: () => done.push(`kill ${each.key}`) } as unknown as PaneShell })),
    stopScope: async (unit) => { done.push(`stop ${unit}`); await stopScope(unit); },
    log: (draft) => { done.push(`${draft.level} ${draft.message}`); },
  });
  return { end, done };
}

describe('pane.reap', () => {
  it('kills every kept shell no page took back, then stops its scope, and says which projects lost how many', async () => {
    const { end, done } = ending([survivor('/work/api', 1, 'agent-api-1.scope'), survivor('/work/api', -1), survivor('/work/web', 2)]);
    const output = 'Ended the shells kept for projects not reopened: 2 in /work/api, 1 in /work/web';
    expect(await end.call({})).toEqual({ output });
    expect(done).toEqual([
      `kill ${paneKey('/work/api', 1)}`, 'stop agent-api-1.scope', `kill ${paneKey('/work/api', -1)}`, `kill ${paneKey('/work/web', 2)}`,
      `info ${output}`,
    ]);
  });

  it('says nothing when every kept shell was taken back', async () => {
    const { end, done } = ending([]);
    expect(await end.call({})).toEqual({ output: '' });
    expect(done).toEqual([]);
  });

  it('logs a scope it could not stop, and ends the rest all the same', async () => {
    const { end, done } = ending([survivor('/work/api', 1, 'agent-api-1.scope')], async () => { throw new Error('timed out'); });
    await end.call({});
    expect(done).toContain('warn agent-api-1.scope was not stopped: timed out');
  });
});
