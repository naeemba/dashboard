import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneOpen, type PaneOpenPorts } from './open';
import type { PaneDispatchInput } from './dispatch';

const API = { path: '/work/api', missing: false };

function opener(project: { path: string; missing: boolean } | undefined) {
  const shells: string[] = [];
  const dispatched: PaneDispatchInput[] = [];
  const ports: PaneOpenPorts = {
    project: () => project,
    openPanes: () => [0, 1, 3],
    shell: (id, directory) => { shells.push(`${id} ${directory}`); },
    dispatch: async (input) => { dispatched.push(input); return { output: 'started' }; },
  };
  return { open: bind(paneOpen, ports), shells, dispatched };
}

describe('pane.open', () => {
  it('opens a plain shell in the project at the lowest free number', async () => {
    const { open, shells, dispatched } = opener(API);
    expect(await open.call({ slot: 2 })).toEqual({ output: 'opened 2:2', index: 2 });
    expect(shells).toEqual(['2:2 /work/api']);
    expect(dispatched).toEqual([]);
  });

  it('starts New Claude and the drawer\'s resume through pane.dispatch, never a shell typed into', async () => {
    const { open, shells, dispatched } = opener(API);
    await open.call({ slot: 2, claude: true });
    await open.call({ slot: 2, directory: '/work/api.worktrees/fix', claude: true, resume: 'session-1' });
    expect(shells).toEqual([]);
    expect(dispatched).toMatchObject([
      { id: '2:2', directory: '/work/api', prompt: null, resume: null, dispatcherPath: null },
      { id: '2:2', directory: '/work/api.worktrees/fix', prompt: null, resume: 'session-1', dispatcherPath: null },
    ]);
  });

  it('refuses a closed page, and a shell in a project folder that is not there', async () => {
    expect(await opener(undefined).open.call({ slot: 2 })).toEqual({ refused: 'That project is closed' });
    const missing = opener({ path: '/work/gone', missing: true });
    expect(await missing.open.call({ slot: 2 })).toEqual({ refused: '/work/gone is not there' });
    expect(await missing.open.call({ slot: 2, directory: '/work/kept', claude: true, resume: 'session-1' })).toMatchObject({ index: 2 });
  });
});
