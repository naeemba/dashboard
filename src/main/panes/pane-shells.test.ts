import { describe, expect, it, vi } from 'vitest';
import { terminalId, EDITOR_INDEX } from '../../shared/panes/terminals';
import { screens } from '../../shared/remote-host/screens';
import type { PaneHost } from './pane-host-client';
import type { PaneShell } from './pane-shell';
import { paneShells } from './pane-shells';

// A shell that never runs anything, kept or not.
function fakeShell(kept?: boolean): PaneShell {
  return {
    pid: 1, process: 'zsh', cols: 80, rows: 24, kept,
    write: () => undefined, resize: () => undefined, kill: () => undefined, pause: () => undefined, resume: () => undefined,
    onData: () => undefined, onExit: () => undefined,
  };
}

const inApp = vi.hoisted(() => ({ spawned: 0 }));
vi.mock('./pane-shell', async (importOriginal) => ({
  ...await importOriginal<typeof import('./pane-shell')>(),
  spawnShell: () => { inApp.spawned += 1; return fakeShell(); },
}));

const EDITOR = terminalId(0, EDITOR_INDEX);
const WORKER = terminalId(0, 1);

function shells() {
  let hostSpawned = 0;
  const host = { spawn: () => { hostSpawned += 1; return fakeShell(true); } } as unknown as PaneHost;
  const made = paneShells({
    host,
    commands: new Map([[EDITOR, { args: 'editor', directory: '/work' }], [WORKER, { args: [], directory: '/work' }]]),
    screens: screens(), environment: {}, temporary: '/nonexistent', shellCommand: () => '/bin/zsh',
    projectPath: () => '/project', send: () => undefined, keepsScreens: () => false, ended: () => undefined,
  });
  return { ...made, hostSpawned: () => hostSpawned };
}

describe('paneShells', () => {
  it('spawns the editor in this process and a worker through the host', () => {
    const made = shells();
    const before = inApp.spawned;
    made.spawn(EDITOR);
    expect(inApp.spawned).toBe(before + 1);
    expect(made.hostSpawned()).toBe(0);
    made.spawn(WORKER);
    expect(made.hostSpawned()).toBe(1);
  });

  it('says work dies at quit only for a worker running in this process', () => {
    const made = shells();
    made.listenTo(EDITOR, fakeShell(), '/bin/zsh');
    expect(made.workDiesAtQuit()).toBe(false);
    made.listenTo(WORKER, fakeShell(true), '/bin/zsh');
    expect(made.workDiesAtQuit()).toBe(false);
    made.listenTo(WORKER, fakeShell(), '/bin/zsh');
    expect(made.workDiesAtQuit()).toBe(true);
  });
});
