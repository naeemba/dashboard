import { describe, expect, it, vi } from 'vitest';
import type { ScreenSession } from '../../chat/chat-sessions';
import { bind } from '../action';
import { sessionBranch } from './branch';
import { WORKER_KEEPS_ITS_CONVERSATION } from './conversation-ports';
import { sessionReset } from './reset';
import { runningElsewhere, sessionResume } from './resume';
import { sessionRewind } from './rewind';

const screen = (owner: 'main' | 'you'): ScreenSession => ({
  session: 'abc', name: 'api-terminal-2', hooks: {}, resume: true, owner, carryOnIn: () => undefined,
});

// Slot 1 is the page's main, 2 a screen opened by hand, 3 main's worker screen, 9 a page with no folder.
function setUp() {
  const workers: Record<number, ScreenSession> = { 2: screen('you'), 3: screen('main') };
  const ports = {
    projectPath: (slot: number) => (slot === 9 ? undefined : '/api'),
    worker: (slot: number) => workers[slot],
    stop: vi.fn(),
    change: vi.fn(async () => undefined),
    runningInPane: (sessionId: string) => (sessionId === 'busy' ? 'terminal 3' : null),
    mainsConversation: () => 'mains',
    conversationOf: (slot: number) => (slot === 1 ? 'mains' : undefined),
    cutPending: () => 'm3',
    fork: vi.fn(async () => undefined),
    rewindFiles: vi.fn(async (_slot: number, _projectPath: string, _pointId: string, dryRun: boolean) => ({ canRewind: true, filesChanged: dryRun ? ['a.ts'] : ['a.ts'] })),
  };
  return { ports, workers };
}

describe('the conversation changes on main\'s worker screen', () => {
  it('refuses /clear, /resume, /branch and /rewind, and changes nothing', async () => {
    const { ports } = setUp();
    const point = { id: 'p1', before: 'm0', text: 'hi' };
    const answers = await Promise.all([
      bind(sessionReset, ports).call({ slot: 3 }),
      bind(sessionResume, ports).call({ slot: 3, sessionId: 'old' }),
      bind(sessionBranch, ports).call({ slot: 3, title: '' }),
      bind(sessionRewind, ports).call({ slot: 3, point, choice: { code: true, conversation: true } }),
    ]);
    expect(answers).toEqual(Array(4).fill({ refused: WORKER_KEEPS_ITS_CONVERSATION }));
    expect(ports.change).not.toHaveBeenCalled();
    expect(ports.rewindFiles).not.toHaveBeenCalled();
  });
});

describe('session.reset', () => {
  it('starts a new conversation on main and on a screen opened by hand, and only stops a page with no folder', async () => {
    const { ports, workers } = setUp();
    const reset = bind(sessionReset, ports);
    await reset.call({ slot: 1 });
    await reset.call({ slot: 2 });
    await reset.call({ slot: 9 });
    expect(ports.change.mock.calls).toEqual([[1, '/api', undefined, undefined], [2, '/api', workers[2], undefined]]);
    expect(ports.stop).toHaveBeenCalledWith(9);
  });
});

describe('session.resume', () => {
  it('refuses a conversation a pane runs, and main\'s on a screen opened by hand', async () => {
    const { ports } = setUp();
    const resume = bind(sessionResume, ports);
    await expect(resume.call({ slot: 1, sessionId: 'busy' })).resolves.toEqual({ refused: 'That conversation is still running in terminal 3' });
    await expect(resume.call({ slot: 2, sessionId: 'mains' })).resolves.toEqual({ refused: 'That conversation is still running in main' });
    await resume.call({ slot: 1, sessionId: 'old' });
    expect(ports.change).toHaveBeenCalledWith(1, '/api', undefined, 'old');
  });

  it('names the pane first, then main for a screen, and nothing for main itself', () => {
    expect(runningElsewhere('xyz', 'terminal 3', screen('you'), 'xyz')).toBe('terminal 3');
    expect(runningElsewhere('xyz', null, screen('you'), 'xyz')).toBe('main');
    expect(runningElsewhere('other', null, screen('you'), 'xyz')).toBeNull();
    expect(runningElsewhere('xyz', null, undefined, 'xyz')).toBeNull();
  });
});

describe('session.branch', () => {
  it('copies main\'s conversation up to a pending cut, and refuses with nothing to copy', async () => {
    const { ports } = setUp();
    const branch = bind(sessionBranch, ports);
    await branch.call({ slot: 1, title: 'try' });
    expect(ports.fork).toHaveBeenCalledWith(1, '/api', undefined, 'mains', 'm3', 'try');
    await expect(branch.call({ slot: 2, title: '' })).resolves.toEqual({ refused: 'Nothing to branch yet: send a prompt first.' });
  });
});

describe('session.rewind', () => {
  it('puts the code back after a dry run, then cuts the conversation; before the first prompt it forgets it', async () => {
    const { ports } = setUp();
    const rewind = bind(sessionRewind, ports);
    const both = { code: true, conversation: true };
    await expect(rewind.call({ slot: 1, point: { id: 'p2', before: 'm1', text: 'x' }, choice: both })).resolves.toMatchObject({ restored: { canRewind: true } });
    expect(ports.rewindFiles.mock.calls.map((call) => call[3])).toEqual([true, false]);
    await rewind.call({ slot: 1, point: { id: 'p1', before: null, text: 'x' }, choice: { code: false, conversation: true } });
    expect(ports.change.mock.calls).toEqual([[1, '/api', undefined, { cutAt: 'm1' }], [1, '/api', undefined, undefined]]);
  });

  it('leaves the conversation alone when the code cannot go back', async () => {
    const { ports } = setUp();
    ports.rewindFiles.mockResolvedValueOnce({ canRewind: false, filesChanged: [] });
    await bind(sessionRewind, ports).call({ slot: 1, point: { id: 'p2', before: 'm1', text: 'x' }, choice: { code: true, conversation: true } });
    expect(ports.rewindFiles).toHaveBeenCalledTimes(1);
    expect(ports.change).not.toHaveBeenCalled();
  });
});
