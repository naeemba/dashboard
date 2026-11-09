import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneDispatch, paneKind, screenNeedsShell, type PaneDispatchInput, type PaneDispatchPorts, type PaneShell } from './dispatch';

const SHIP: PaneDispatchInput = {
  id: '2:3', projectPath: '/work/api', directory: '/work/api.worktrees/fix', prompt: '/work-card c1',
  resume: null, cardId: 'c1', dispatcherPath: null, as: null,
};
const RUN: PaneDispatchInput = { ...SHIP, directory: '/work/api', prompt: 'research the cache', cardId: null, dispatcherPath: '/work/desk' };

function started(platform = 'linux', shell: PaneShell = { directory: '/work/api', running: true }) {
  const seen: { claimed?: string | null; plainShell?: string; terminal?: { id: string; directory: string; words: string }; screen?: unknown[]; ranAs?: string; order: string[] } = { order: [] };
  const ports: PaneDispatchPorts = {
    platform,
    shellCommand: () => '/bin/zsh',
    newSession: (_projectPath, _directory, _cardId, kind) => `new-${kind}-session`,
    ranAs: (session, kind) => { seen.ranAs = `${session} ${kind}`; },
    starting: (_id, _projectPath, dispatcherPath) => { seen.claimed = dispatcherPath; },
    shellOf: () => shell,
    terminal: (id, directory, agentArguments) => { seen.terminal = { id, directory, words: agentArguments.join(' ') }; },
    plainShell: (_id, directory) => { seen.plainShell = directory; seen.order.push('plainShell'); },
    screen: (...given) => { seen.screen = given; seen.order.push('screen'); },
  };
  return { seen, dispatch: bind(paneDispatch, ports) };
}

describe('paneKind', () => {
  // Each caller's case: pane run, a ship or review loop, a resume after a restart, New Claude.
  it('picks a screen off Windows, a terminal on it, and whatever pane run asked for either way', () => {
    expect(paneKind(SHIP, 'linux')).toBe('screen');
    expect(paneKind(SHIP, 'darwin')).toBe('screen');
    expect(paneKind(SHIP, 'win32')).toBe('terminal');
    expect(paneKind({ ...RUN, as: 'terminal' }, 'linux')).toBe('terminal');
    expect(paneKind({ ...RUN, as: 'screen' }, 'win32')).toBe('screen');
  });

  it('resumes a conversation as what it last ran as, and one of unknown kind as pane run would', () => {
    const resume = { ...SHIP, prompt: null, resume: 'old' };
    expect(paneKind({ ...resume, as: 'terminal' }, 'linux')).toBe('terminal');
    expect(paneKind({ ...resume, as: 'screen' }, 'linux')).toBe('screen');
    expect(paneKind({ ...resume, as: 'screen' }, 'win32')).toBe('screen');
    expect(paneKind(resume, 'linux')).toBe('screen');
    expect(paneKind(resume, 'win32')).toBe('terminal');
  });

  it('opens New Claude as a screen everywhere', () => {
    expect(paneKind({ ...SHIP, prompt: null }, 'win32')).toBe('screen');
  });
});

describe('pane.dispatch', () => {
  it('starts a card\'s agent on a screen with its prompt as the first message, before the call settles', () => {
    const { seen, dispatch } = started();
    void dispatch.call(SHIP);
    expect(seen.screen).toEqual(['2:3', '/work/api', '/work/api.worktrees/fix', { session: 'new-screen-session', resume: false, name: 'api-terminal-4', prompt: '/work-card c1' }, 'c1', null]);
    expect(seen.terminal).toBeUndefined();
    expect(seen.claimed).toBeNull();
  });

  it('claims the pane for the main a worker reports to', async () => {
    const { seen, dispatch } = started();
    await dispatch.call(RUN);
    expect(seen.claimed).toBe('/work/desk');
    expect(seen.plainShell).toBeUndefined();
  });

  it('puts the hidden shell in the worktree before the screen, for a new pane or one standing in the project', async () => {
    const fresh = started('linux', { directory: undefined, running: false });
    await fresh.dispatch.call(SHIP);
    expect(fresh.seen.plainShell).toBe('/work/api.worktrees/fix');
    expect(fresh.seen.order).toEqual(['plainShell', 'screen']);
    const reused = started();
    await reused.dispatch.call(SHIP);
    expect(reused.seen.plainShell).toBe('/work/api.worktrees/fix');
  });

  it('opens New Claude as a screen of yours that waits for you to type', async () => {
    const { seen, dispatch } = started('win32');
    await dispatch.call({ ...RUN, prompt: null, dispatcherPath: null });
    expect(seen.screen).toEqual(['2:3', '/work/api', '/work/api', { session: 'new-screen-session', resume: false, name: 'api-terminal-4', prompt: null }, null, null]);
    expect(seen.claimed).toBeNull();
    expect(seen.plainShell).toBeUndefined();
  });

  it('gives main\'s worker its report-back prompt on a screen, and its hooks in a terminal', async () => {
    const screen = started();
    await screen.dispatch.call(RUN);
    expect((screen.seen.screen?.[3] as { prompt: string }).prompt).toMatch(/^research the cache\n\nSendMessage to main-desk when done/);
    const terminal = started('win32');
    expect(await terminal.dispatch.call(RUN)).toEqual({ output: 'started Claude Code in 2:3' });
    expect(terminal.seen.terminal?.words).toContain('--settings');
    expect(terminal.seen.terminal?.words).toContain('--session-id');
  });

  it('resumes a terminal\'s conversation in the terminal, as a worker or as a card\'s agent', async () => {
    const worker = started();
    await worker.dispatch.call({ ...RUN, prompt: null, resume: 'old', as: 'terminal' });
    expect(worker.seen.terminal?.words).toMatch(/--resume.*old.*--settings/);
    const agent = started();
    await agent.dispatch.call({ ...SHIP, prompt: null, resume: 'old', as: 'terminal' });
    expect(agent.seen.terminal?.words).toContain('claude --resume old');
    expect(agent.seen.screen).toBeUndefined();
    expect(agent.seen.ranAs).toBe('old terminal');
  });

  // 2026-11-09: a screen's conversation resumed from the drawer came back as Claude Code in a terminal.
  it('resumes a screen\'s conversation on a screen, on that conversation rather than a new one', async () => {
    const { seen, dispatch } = started();
    expect(await dispatch.call({ ...RUN, prompt: null, resume: 'old', dispatcherPath: null, as: 'screen' })).toEqual({ output: 'started a Claude screen in 2:3' });
    expect(seen.screen?.[3]).toEqual({ session: 'old', resume: true, name: 'api-terminal-4', prompt: null });
    expect(seen.terminal).toBeUndefined();
    expect(seen.ranAs).toBe('old screen');
  });

  it('records a new conversation as what it runs as', async () => {
    const terminal = started('win32');
    await terminal.dispatch.call(SHIP);
    expect(terminal.seen.terminal?.words).toContain('new-terminal-session');
    expect(terminal.seen.ranAs).toBeUndefined();
  });

  it('refuses what it cannot read', async () => {
    const { seen, dispatch } = started();
    expect(await dispatch.call({ ...SHIP, as: 'window' })).toEqual({ refused: 'a pane runs a screen or a terminal' });
    expect(await dispatch.call({ ...SHIP, id: '' })).toEqual({ refused: 'no pane was given' });
    expect(seen).toEqual({ order: [] });
  });
});

describe('screenNeedsShell', () => {
  it('starts the hidden shell over wherever it is not running in the screen\'s folder', () => {
    expect(screenNeedsShell({ directory: '/work/api.worktrees/fix', running: false }, '/work/api.worktrees/fix')).toBe(true);
    expect(screenNeedsShell({ directory: '/work/api', running: true }, '/work/api.worktrees/fix')).toBe(true);
    expect(screenNeedsShell({ directory: '/work/api.worktrees/old', running: true }, '/work/api.worktrees/fix')).toBe(true);
    expect(screenNeedsShell({ directory: undefined, running: true }, '/work/api')).toBe(true);
  });

  it('leaves one already running in the screen\'s folder', () => {
    expect(screenNeedsShell({ directory: '/work/api', running: true }, '/work/api')).toBe(false);
    expect(screenNeedsShell({ directory: '/work/api.worktrees/fix', running: true }, '/work/api.worktrees/fix')).toBe(false);
  });
});
