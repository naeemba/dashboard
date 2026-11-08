import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneDispatch, paneKind, type PaneDispatchInput, type PaneDispatchPorts } from './dispatch';

const SHIP: PaneDispatchInput = {
  id: '2:3', projectPath: '/work/api', directory: '/work/api.worktrees/fix', prompt: '/work-card c1',
  resume: null, cardId: 'c1', dispatcherPath: null, as: null,
};
const RUN: PaneDispatchInput = { ...SHIP, directory: '/work/api', prompt: 'research the cache', cardId: null, dispatcherPath: '/work/desk' };

function started(platform = 'linux') {
  const seen: { terminal?: { id: string; directory: string; words: string }; screen?: unknown[] } = {};
  const ports: PaneDispatchPorts = {
    platform,
    shellCommand: () => '/bin/zsh',
    newSession: () => 'new-session',
    terminal: (id, _projectPath, directory, agentArguments) => { seen.terminal = { id, directory, words: agentArguments.join(' ') }; },
    screen: (...given) => { seen.screen = given; },
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

  it('resumes a terminal\'s conversation in a terminal, and opens New Claude as a screen', () => {
    expect(paneKind({ ...SHIP, prompt: null, resume: 'old' }, 'linux')).toBe('terminal');
    expect(paneKind({ ...SHIP, prompt: null, as: 'screen' }, 'win32')).toBe('screen');
  });
});

describe('pane.dispatch', () => {
  it('starts a card\'s agent on a screen with its prompt as the first message, before the call settles', () => {
    const { seen, dispatch } = started();
    void dispatch.call(SHIP);
    expect(seen.screen).toEqual(['2:3', '/work/api', '/work/api.worktrees/fix', { session: 'new-session', name: 'api-terminal-4', prompt: '/work-card c1' }, 'c1', null]);
    expect(seen.terminal).toBeUndefined();
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

  it('resumes the conversation it was handed, as a worker or as a card\'s agent', async () => {
    const worker = started();
    await worker.dispatch.call({ ...RUN, prompt: null, resume: 'old' });
    expect(worker.seen.terminal?.words).toMatch(/--resume.*old.*--settings/);
    const agent = started();
    await agent.dispatch.call({ ...SHIP, prompt: null, resume: 'old' });
    expect(agent.seen.terminal?.words).toContain('claude --resume old');
    expect(agent.seen.screen).toBeUndefined();
  });

  it('refuses what it cannot read', async () => {
    const { seen, dispatch } = started();
    expect(await dispatch.call({ ...SHIP, as: 'window' })).toEqual({ refused: 'a pane runs a screen or a terminal' });
    expect(await dispatch.call({ ...SHIP, id: '' })).toEqual({ refused: 'no pane was given' });
    expect(seen).toEqual({});
  });
});
