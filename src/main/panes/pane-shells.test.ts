import { describe, expect, it, vi } from 'vitest';
import { terminalId, EDITOR_INDEX } from '../../shared/panes/terminals';
import { screens } from '../../shared/remote-host/screens';
import type { PaneHost } from './pane-host-client';
import type { PaneShell } from './pane-shell';
import type { SpawnRequest } from './pane-host-protocol';
import { paneShells } from './pane-shells';
import type { ScopeRequest } from '../processes/scope';

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
const AGENT = terminalId(0, 2);

// Every scope asked for is granted as `<kind>-<id>.scope`, wrapping the command in `scoped`.
function shells() {
  let hostSpawned = 0;
  const requests: SpawnRequest[] = [];
  const host = { spawn: (request: SpawnRequest) => { hostSpawned += 1; requests.push(request); return fakeShell(true); } } as unknown as PaneHost;
  const made = paneShells({
    host,
    commands: new Map([
      [EDITOR, { args: 'editor', directory: '/work' }], [WORKER, { args: [], directory: '/work' }],
      [AGENT, { args: ['-ilc', 'claude'], directory: '/work' }],
    ]),
    screens: screens(), environment: {}, temporary: '/nonexistent', shellCommand: () => '/bin/zsh',
    scoped: (request: ScopeRequest) => ({ file: 'scoped', args: [request.file, ...request.args], unit: `${request.kind}-${request.id}.scope` }),
    projectPath: () => '/home/me/dashboard', send: () => undefined, keepsScreens: () => false, ended: () => undefined,
  });
  return { ...made, hostSpawned: () => hostSpawned, requests };
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

  it('scopes an agent pane as an agent and a plain one as a shell, named after the project and pane', () => {
    const made = shells();
    made.spawn(AGENT);
    made.spawn(WORKER);
    expect(made.requests.map((request) => request.scope)).toEqual([
      { unit: 'agent-dashboard-2.scope', file: 'scoped', args: ['/bin/zsh', '-ilc', 'claude'] },
      { unit: 'shell-dashboard-1.scope', file: 'scoped', args: ['/bin/zsh'] },
    ]);
    expect(made.requests[0]).toMatchObject({ file: '/bin/zsh', args: ['-ilc', 'claude'] });
    expect(made.scopeUnits.get(AGENT)).toBe('agent-dashboard-2.scope');
  });

  it('forgets a pane\'s scope when the pane is dropped or its shell comes back unscoped', () => {
    const made = shells();
    made.spawn(AGENT);
    made.drop(AGENT);
    expect(made.scopeUnits.has(AGENT)).toBe(false);
    made.listenTo(WORKER, fakeShell(true), '/bin/zsh', 'pane-kept.scope');
    expect(made.scopeUnits.get(WORKER)).toBe('pane-kept.scope');
    made.listenTo(WORKER, fakeShell(true), '/bin/zsh', undefined);
    expect(made.scopeUnits.has(WORKER)).toBe(false);
  });

  it('hands project.close the scope of every pane of the project, the editor\'s included, and no other project\'s', () => {
    const made = shells();
    made.spawn(EDITOR);
    made.spawn(AGENT);
    made.listenTo(terminalId(1, 1), fakeShell(true), '/bin/zsh', 'pane-other-1.scope');
    expect(made.scopesIn(0).sort()).toEqual(['agent-dashboard-2.scope', 'shell-dashboard--1.scope']);
  });

  it('says work dies at quit only for a worker running in this process', () => {
    const made = shells();
    made.listenTo(EDITOR, fakeShell(), '/bin/zsh', undefined);
    expect(made.workDiesAtQuit()).toBe(false);
    made.listenTo(WORKER, fakeShell(true), '/bin/zsh', undefined);
    expect(made.workDiesAtQuit()).toBe(false);
    made.listenTo(WORKER, fakeShell(), '/bin/zsh', undefined);
    expect(made.workDiesAtQuit()).toBe(true);
  });
});
