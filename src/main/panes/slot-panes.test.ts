import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '../../shared/app/bridge';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import type { PaneCommand } from '../../shared/panes/pane-reading';
import { EDITOR_INDEX, terminalId } from '../../shared/panes/terminals';
import { temporaryFolder } from '../testing/temporary-folder';
import { slotPanes, type SlotPaneSources } from './slot-panes';

const project = (projectPath: string): Project => ({ path: projectPath, name: path.basename(projectPath), missing: false });

// One project on slot 0 at /work/crm: its editor, an idle worker 1, worker 2 in a worktree running an
// agent, and worker 3 running a program in its shell.
function sources(overrides: Partial<SlotPaneSources> = {}): SlotPaneSources {
  const commands = new Map<string, PaneCommand>([
    [terminalId(0, EDITOR_INDEX), { args: 'editor', directory: '/work/crm' }],
    [terminalId(0, 1), { args: [], directory: '/work/crm' }],
    [terminalId(0, 2), { args: ['claude'], directory: '/work/crm.worktrees/fix-login' }],
    [terminalId(0, 3), { args: [], directory: '/work/crm' }],
  ]);
  return {
    projects: [project('/work/crm')],
    commands,
    shells: new Map([[terminalId(0, 1), {}], [terminalId(0, 2), {}], [terminalId(0, EDITOR_INDEX), {}]]),
    foregroundOf: (id) => (id === terminalId(0, 3) ? 'npm' : 'zsh'),
    startedWith: new Map([[terminalId(0, 1), 'zsh'], [terminalId(0, 2), 'zsh'], [terminalId(0, 3), 'zsh']]),
    workerScreens: () => ({ has: () => false, working: () => undefined, ids: () => [] }),
    agentsAtWork: { works: () => false },
    pausedAtWork: () => false,
    ...overrides,
  };
}

describe('slotPanes', () => {
  it('reads each open worker, less the editor, with whether it sits in a worktree and has exited', () => {
    const panes = slotPanes(sources());
    expect(panes.openPanes(0)).toEqual([1, 2, 3]);
    expect(panes.paneUsesIn(0).map(({ index, inWorktree, exited }) => ({ index, inWorktree, exited }))).toEqual([
      { index: 1, inWorktree: false, exited: false },
      { index: 2, inWorktree: true, exited: false },
      { index: 3, inWorktree: false, exited: true },
    ]);
  });

  it('reads the manager slot against its own folder', () => {
    const panes = slotPanes(sources({ commands: new Map([[terminalId(MANAGER_SLOT, 1), { args: [], directory: '/elsewhere' }]]) }));
    expect(panes.paneReadingsIn(MANAGER_SLOT)).toMatchObject([{ index: 1, inWorktree: true }]);
  });

  it('picks the idle worker outside a worktree, and the next number once every worker is busy', () => {
    expect(slotPanes(sources()).freePaneIn(0)).toBe(1);
    const busy = sources();
    const commands = new Map(busy.commands);
    commands.set(terminalId(0, 1), { args: ['claude'], directory: '/work/crm' });
    expect(slotPanes({ ...busy, commands }).freePaneIn(0)).toBe(4);
  });

  it('counts an agent from its command or its Claude screen, and has it working by the screen before the report', () => {
    const screen: { working: boolean | undefined } = { working: undefined };
    const panes = slotPanes(sources({
      workerScreens: () => ({ has: (id) => id === terminalId(0, 1), working: () => screen.working, ids: () => [terminalId(0, 1)] }),
      agentsAtWork: { works: () => true },
    }));
    expect([panes.agentIn(terminalId(0, 1)), panes.agentIn(terminalId(0, 2)), panes.agentIn(terminalId(0, 3))]).toEqual([true, true, false]);
    expect(panes.agentRunsIn(0, null)).toBe(false);
    expect(panes.agentWorksIn(0, 3)).toBe(false);
    expect(panes.agentWorksIn(0, 1)).toBe(true);
    screen.working = false;
    expect(panes.agentWorksIn(0, 1)).toBe(false);
    expect(panes.agentWorksIn(0, null)).toBe(false);
  });

  it('has an agent paused on its own background work still working, and no pane without an agent', () => {
    const panes = slotPanes(sources({
      workerScreens: () => ({ has: (id) => id === terminalId(0, 1), working: () => false, ids: () => [terminalId(0, 1)] }),
      pausedAtWork: (id) => id === terminalId(0, 1),
    }));
    expect(panes.agentWorksIn(0, 1)).toBe(true);
    expect(panes.agentWorksIn(0, 3)).toBe(false);
  });

  it('lists every page with its workers, the screens and which pages have their editor running', () => {
    const projects = [project('/work/crm'), undefined];
    expect(slotPanes(sources({ projects })).openProjects()).toEqual({
      projects: [project('/work/crm'), null], panes: [[1, 2, 3], []], manager: [], screens: [], editors: [0],
    });
  });

  it('finds a project opened through a symlink by its real path, and -1 for one not open', () => {
    const folder = temporaryFolder('dashboard-slot-panes-');
    const real = path.join(folder, 'crm');
    mkdirSync(real);
    symlinkSync(real, path.join(folder, 'link'));
    const panes = slotPanes(sources({ projects: [undefined, project(path.join(folder, 'link'))] }));
    expect(panes.slotOfProject(real)).toBe(1);
    expect(panes.slotOfProject(path.join(folder, 'other'))).toBe(-1);
  });
});
