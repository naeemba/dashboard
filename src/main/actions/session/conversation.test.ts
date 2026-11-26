import { describe, expect, it, vi } from 'vitest';
import type { ScreenSession } from '../../chat/chat-sessions';
import { slotConversation, WORKER_KEEPS_ITS_CONVERSATION } from '../../chat/slot-conversation';
import { bind } from '../action';
import { sessionBranch } from './branch';
import { sessionReset } from './reset';
import { runningElsewhere, sessionResume } from './resume';
import { sessionRewind, type SessionRewindPorts } from './rewind';

const screen = (owner: 'main' | 'you'): ScreenSession => ({
  id: '1:2', projectPath: '/work/api', session: 'abc', name: 'api-terminal-2', hooks: {}, resume: true, owner, carryOnIn: () => undefined,
});

// Slot 1 is the page's main, with a cut pending; 2 a screen opened by hand with nothing written yet;
// 3 main's worker screen; 9 a page with no folder.
function setUp() {
  const workers: Record<number, ScreenSession> = { 2: { ...screen('you'), resume: false }, 3: screen('main') };
  const conversations = Object.fromEntries([1, 2, 3, 9].map((slot) => [slot, slotConversation(workers[slot], 'mains', 'm3')]));
  const ports = {
    projectPath: (slot: number) => (slot === 9 ? undefined : '/api'),
    conversation: (slot: number) => conversations[slot],
    stop: vi.fn(),
    change: vi.fn(async () => undefined),
    runningInPane: (sessionId: string) => (sessionId === 'busy' ? 'terminal 3' : null),
    fork: vi.fn(async () => undefined),
    rewindFiles: vi.fn<SessionRewindPorts['rewindFiles']>(async () => ({ canRewind: true, filesChanged: ['a.ts'] })),
  };
  return { ports, conversations };
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
    const { ports, conversations } = setUp();
    const reset = bind(sessionReset, ports);
    await reset.call({ slot: 1 });
    await reset.call({ slot: 2 });
    await reset.call({ slot: 9 });
    expect(ports.change.mock.calls).toEqual([[1, '/api', conversations[1], undefined], [2, '/api', conversations[2], undefined]]);
    expect(ports.stop).toHaveBeenCalledWith(9);
  });
});

describe('session.resume', () => {
  it('refuses a conversation a pane runs, and main\'s on a screen opened by hand', async () => {
    const { ports, conversations } = setUp();
    const resume = bind(sessionResume, ports);
    await expect(resume.call({ slot: 1, sessionId: 'busy' })).resolves.toEqual({ refused: 'That conversation is still running in terminal 3' });
    await expect(resume.call({ slot: 2, sessionId: 'mains' })).resolves.toEqual({ refused: 'That conversation is still running in main' });
    await resume.call({ slot: 1, sessionId: 'old' });
    expect(ports.change).toHaveBeenCalledWith(1, '/api', conversations[1], 'old');
  });

  it('names the pane first, then main for a screen, and nothing for main itself', () => {
    const onScreen = slotConversation(screen('you'), 'xyz', undefined);
    expect(runningElsewhere('xyz', 'terminal 3', onScreen)).toBe('terminal 3');
    expect(runningElsewhere('xyz', null, onScreen)).toBe('main');
    expect(runningElsewhere('other', null, onScreen)).toBeNull();
    expect(runningElsewhere('xyz', null, slotConversation(undefined, 'xyz', undefined))).toBeNull();
  });
});

describe('session.branch', () => {
  it('copies main\'s conversation up to a pending cut, and refuses with nothing to copy', async () => {
    const { ports, conversations } = setUp();
    const branch = bind(sessionBranch, ports);
    await branch.call({ slot: 1, title: 'try' });
    expect(ports.fork).toHaveBeenCalledWith(1, '/api', conversations[1], 'm3', 'try');
    await expect(branch.call({ slot: 2, title: '' })).resolves.toEqual({ refused: 'Nothing to branch yet: send a prompt first.' });
  });
});

describe('session.rewind', () => {
  it('puts the code back after a dry run, then cuts the conversation; before the first prompt it forgets it', async () => {
    const { ports, conversations } = setUp();
    const rewind = bind(sessionRewind, ports);
    const both = { code: true, conversation: true };
    await expect(rewind.call({ slot: 1, point: { id: 'p2', before: 'm1', text: 'x' }, choice: both })).resolves.toMatchObject({ restored: { canRewind: true } });
    expect(ports.rewindFiles.mock.calls.map((call) => call[3])).toEqual([true, false]);
    await rewind.call({ slot: 1, point: { id: 'p1', before: null, text: 'x' }, choice: { code: false, conversation: true } });
    expect(ports.change.mock.calls).toEqual([[1, '/api', conversations[1], { cutAt: 'm1' }], [1, '/api', conversations[1], undefined]]);
  });

  it('leaves the conversation alone when the code cannot go back', async () => {
    const { ports } = setUp();
    ports.rewindFiles.mockResolvedValueOnce({ canRewind: false, filesChanged: [] });
    await bind(sessionRewind, ports).call({ slot: 1, point: { id: 'p2', before: 'm1', text: 'x' }, choice: { code: true, conversation: true } });
    expect(ports.rewindFiles).toHaveBeenCalledTimes(1);
    expect(ports.change).not.toHaveBeenCalled();
  });
});

describe('the conversation changes on a slot the app cannot read', () => {
  it('refuses each one, and /branch on a page with no folder', async () => {
    const { ports } = setUp();
    const point = { id: 'p1', before: 'm0', text: 'hi' };
    const both = { code: true, conversation: true };
    const answers = await Promise.all([
      bind(sessionReset, ports).call({ slot: 1.5 }),
      bind(sessionResume, ports).call({ slot: 1, sessionId: '' }),
      bind(sessionBranch, ports).call({ slot: 1.5, title: '' }),
      bind(sessionRewind, ports).call({ slot: 1, point: { ...point, before: 3 }, choice: both }),
      bind(sessionRewind, ports).call({ slot: 1, point, choice: { code: 'yes', conversation: true } }),
    ]);
    expect(answers.every((answer) => 'refused' in answer)).toBe(true);
    await expect(bind(sessionBranch, ports).call({ slot: 9, title: '' })).resolves.toEqual({ refused: 'Nothing to branch yet: send a prompt first.' });
    await expect(bind(sessionRewind, ports).call({ slot: 9, point, choice: both })).resolves.toEqual({ refused: 'the page has no project to rewind' });
    expect(ports.change).not.toHaveBeenCalled();
  });
});
