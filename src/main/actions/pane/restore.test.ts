import { describe, expect, it } from 'vitest';
import type { WorktreeEntry } from '../../../shared/app/bridge';
import type { PaneCommand } from '../../../shared/panes/pane-reading';
import { paneKey, type Survivor } from '../../panes/pane-host-protocol';
import type { PaneShell } from '../../panes/pane-shell';
import type { PaneConversation } from '../../workers/claude-resume';
import { bind } from '../action';
import type { PaneDispatchInput } from './dispatch';
import { paneRestore, type PaneRestorePorts, type ScreenBack } from './restore';

const API = '/work/api';
const OURS = '11111111-1111-1111-1111-111111111111';
const MAINS = '22222222-2222-2222-2222-222222222222';
const CARDS = '33333333-3333-3333-3333-333333333333';
const CARD: WorktreeEntry = {
  cardId: 'card-1', title: 'fix', projectPath: API, branch: 'fix', worktreePath: '/work/api.worktrees/fix',
  pane: null, startedAt: '', reviewing: false,
};

function survivor(index: number): Survivor {
  return { key: paneKey(API, index), pid: 1, file: 'zsh', args: ['claude'], cwd: API, cols: 80, rows: 24, foreground: 'claude', screen: '' };
}

function restoring(saved: Map<number, PaneConversation>, kept: Survivor[] = [], screens: ScreenBack[] = [], failing: string | null = null) {
  const commands = new Map<string, PaneCommand>();
  const dispatched: PaneDispatchInput[] = [];
  const records: WorktreeEntry[] = [];
  const mainsWorkers = new Map<string, string>();
  const killed: string[] = [];
  const listened: string[] = [];
  const ports: PaneRestorePorts = {
    kept: () => kept.map((each) => ({ survivor: each, shell: { kill: () => killed.push(each.key) } as unknown as PaneShell })),
    listenTo: (id) => { listened.push(id); },
    takeResume: (_projectPath, index) => saved.get(index) ?? null,
    owedResumes: () => [...saved.keys()].filter((index) => index > 0 && !kept.some((each) => each.key === paneKey(API, index))),
    moveResume: () => undefined,
    screensBack: () => screens,
    worktrees: () => [CARD],
    panesBeforeLaunch: new Map([['card-1', 2]]),
    realPath: (folder) => folder,
    givePane: (entry, index) => { records.push({ ...entry, pane: index }); },
    mainsWorkers,
    hasCommand: (id) => commands.has(id),
    setPaneCommand: (id, command) => { commands.set(id, command); },
    reserve: (id, directory) => { commands.set(id, { args: [], directory }); },
    spawn: () => undefined,
    openPanes: (slot) => [...commands.keys()].filter((id) => id.startsWith(`${slot}:`)).map((id) => Number(id.split(':')[1])),
    dispatch: async (input) => {
      dispatched.push(input);
      if (input.id === failing) throw new Error(`${input.id} would not start`);
      return { output: 'started' };
    },
  };
  return { restore: bind(paneRestore, ports), commands, dispatched, records, mainsWorkers, killed, listened };
}

describe('pane.restore', () => {
  it('carries every saved conversation on through pane.dispatch: yours, main\'s worker and a card\'s agent', async () => {
    const { restore, dispatched, records } = restoring(new Map([
      [1, { session: OURS, directory: API }],
      [2, { session: CARDS, directory: CARD.worktreePath }],
      [3, { session: MAINS, directory: API, dispatched: true, dispatcher: '/work/desk' }],
    ]));
    await restore.call({ slot: 2, projectPath: API, firstPane: null });
    expect(dispatched).toMatchObject([
      { id: '2:1', directory: API, resume: OURS, prompt: null, dispatcherPath: null },
      { id: '2:2', directory: CARD.worktreePath, resume: CARDS, dispatcherPath: null },
      { id: '2:3', directory: API, resume: MAINS, dispatcherPath: '/work/desk' },
    ]);
    expect(records).toEqual([{ ...CARD, pane: 2 }]);
  });

  it('opens the first pane that was not main\'s in a worker after the rest', async () => {
    const { restore, dispatched } = restoring(new Map([[1, { session: OURS, directory: API }]]));
    await restore.call({ slot: 2, projectPath: API, firstPane: { session: MAINS, directory: '/elsewhere' } });
    expect(dispatched.map((each) => [each.id, each.resume])).toEqual([['2:1', OURS], ['2:2', MAINS]]);
  });

  it('adopts the shells the host kept, before the resumes, and kills the editor\'s', async () => {
    const { restore, commands, dispatched, listened, killed } = restoring(new Map(), [survivor(1), survivor(-1)]);
    await restore.call({ slot: 2, projectPath: API, firstPane: null });
    expect(commands.get('2:1')).toEqual({ args: ['claude'], directory: API });
    expect(listened).toEqual(['2:1']);
    expect(killed).toEqual([paneKey(API, -1)]);
    expect(dispatched).toEqual([]);
  });

  it('opens a worker screen\'s pane again when it closed, and gives main its worker back', async () => {
    const { restore, commands, mainsWorkers } = restoring(new Map(), [], [
      { index: 4, directory: API, session: MAINS, dispatcherPath: '/work/desk' },
    ]);
    await restore.call({ slot: 2, projectPath: API, firstPane: null });
    expect(commands.get('2:4')).toEqual({ args: [], directory: API });
    expect(mainsWorkers.get('2:4')).toBe('/work/desk');
  });

  it('brings back the panes after a resume that fails, then fails with it', async () => {
    const { restore, dispatched, commands } = restoring(new Map([
      [1, { session: OURS, directory: API }],
      [2, { session: MAINS, directory: API }],
    ]), [], [{ index: 4, directory: API, session: CARDS, dispatcherPath: null }], '2:1');
    await expect(restore.call({ slot: 2, projectPath: API, firstPane: null })).rejects.toThrow('2:1 would not start');
    expect(dispatched.map((each) => each.id)).toEqual(['2:1', '2:2']);
    expect(commands.get('2:4')).toEqual({ args: [], directory: API });
  });

  it('has every pane set by the time the call returns, before anything is awaited', () => {
    const { restore, dispatched } = restoring(new Map([[1, { session: OURS, directory: API }]]));
    void restore.call({ slot: 2, projectPath: API, firstPane: null });
    expect(dispatched).toHaveLength(1);
  });
});
