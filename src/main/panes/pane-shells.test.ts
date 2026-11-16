import { describe, expect, it } from 'vitest';
import { terminalId, EDITOR_INDEX } from '../../shared/panes/terminals';
import { screens } from '../../shared/remote-host/screens';
import type { PaneHost } from './pane-host-client';
import { foregroundName, type PaneShell } from './pane-shell';
import type { SpawnRequest } from './pane-host-protocol';
import { paneShells } from './pane-shells';
import { editorSocket, keptEditorSocket } from '../nvim/nvim-remote';
import type { ScopeRequest } from '../processes/scope';

// A shell that never runs anything, kept or not.
function fakeShell(kept?: boolean): PaneShell {
  return {
    pid: 1, process: 'zsh', cols: 80, rows: 24, kept,
    write: () => undefined, resize: () => undefined, kill: () => undefined, pause: () => undefined, resume: () => undefined,
    onData: () => undefined, onExit: () => undefined,
  };
}

const EDITOR = terminalId(0, EDITOR_INDEX);
const WORKER = terminalId(0, 1);
const AGENT = terminalId(0, 2);

// Every scope asked for is granted as `<kind>-<id>.scope`, wrapping the command in `scoped`.
function shells(holds = true) {
  let hostSpawned = 0;
  const requests: SpawnRequest[] = [];
  const host = { spawn: (request: SpawnRequest) => { hostSpawned += 1; requests.push(request); return fakeShell(true); }, holds: () => holds } as unknown as PaneHost;
  const made = paneShells({
    host,
    commands: new Map([
      [EDITOR, { args: 'editor', directory: '/work' }], [WORKER, { args: [], directory: '/work' }],
      [AGENT, { args: ['-ilc', 'claude'], directory: '/work' }],
    ]),
    screens: screens(), environment: {}, temporary: '/nonexistent', userData: '/nonexistent-user-data', shellCommand: () => '/bin/zsh',
    scoped: (request: ScopeRequest) => ({ file: 'scoped', args: [request.file, ...request.args], unit: `${request.kind}-${request.id}.scope` }),
    projectPath: () => '/home/me/dashboard', send: () => undefined, keepsScreens: () => false, ended: () => undefined,
  });
  return { ...made, hostSpawned: () => hostSpawned, requests };
}

describe('paneShells', () => {
  // The next launch reaches a kept nvim only under a name it can work out again: the project's.
  it('spawns the editor through the host, listening under the project\'s name while the host holds it', () => {
    const made = shells();
    made.spawn(EDITOR);
    expect(made.hostSpawned()).toBe(1);
    const kept = keptEditorSocket(process.platform, '/nonexistent-user-data', '/home/me/dashboard');
    expect(made.editorSocketOf(0)).toBe(kept);
    expect(made.requests[0].args.join(' ')).toContain(kept);
  });

  // A second Dashboard on the same user data is turned away by the host, and must not take the
  // first one's editor socket.
  it('names the editor\'s socket for this process when the host does not hold its shells', () => {
    expect(shells(false).editorSocketOf(0)).toBe(editorSocket('/nonexistent', 0));
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

  // pane-shell.ts's foregroundName says why.
  it('marks an in-process shell past its runner on its first output, so a systemd-run started later reads as a program', () => {
    const made = shells();
    const listeners: ((data: string) => void)[] = [];
    const shell = { ...fakeShell(), onData: (listener: (data: string) => void) => listeners.push(listener) };
    made.listenTo(WORKER, shell, '/bin/zsh', undefined);
    listeners.forEach((listener) => listener('$ '));
    shell.process = 'systemd-run';
    // foregroundName, not foregroundOf: that one answers nothing on win32 by design.
    expect(foregroundName(shell)).toBe('systemd-run');
  });

  it('passes a pane host\'s reading through as it is, runner or not', () => {
    expect(foregroundName({ ...fakeShell(true), process: 'systemd-run' })).toBe('systemd-run');
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

  // Otherwise the quit question promises an editor back that the quit kills.
  it('says the editor dies at quit only when it runs in this process', () => {
    const made = shells();
    made.listenTo(WORKER, fakeShell(), '/bin/zsh', undefined);
    expect(made.editorDiesAtQuit()).toBe(false);
    made.listenTo(EDITOR, fakeShell(true), '/bin/zsh', undefined);
    expect(made.editorDiesAtQuit()).toBe(false);
    made.listenTo(EDITOR, fakeShell(), '/bin/zsh', undefined);
    expect(made.editorDiesAtQuit()).toBe(true);
  });
});
