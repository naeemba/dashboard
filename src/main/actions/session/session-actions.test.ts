import { describe, expect, it, vi } from 'vitest';
import type { ChannelHandler, Channels } from '../../app/channels';
import { registerSessionChannels, sessionActions, type ChatActionPorts } from './session-actions';

const { renameSession } = vi.hoisted(() => ({ renameSession: vi.fn(async () => undefined) }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ renameSession }));

function wired(start: (slot: number) => Promise<string> = async () => 'api-1') {
  const chat = {
    start,
    onScreen: () => 'abc',
    projectPath: (slot: number) => (slot === 1 ? '/api' : undefined),
    worker: () => undefined,
    stop: () => undefined,
    change: async () => undefined,
    rewindFiles: async () => ({ canRewind: false, error: 'nothing to restore' }),
  } as unknown as ChatActionPorts;
  const sessions = {
    row: (id: string) => (id === 'abc' ? { directory: '/api.worktrees/card' } : undefined),
    rename: () => null,
  } as unknown as Parameters<typeof sessionActions>[0]['sessions'];
  const actions = sessionActions({ chat, sessions, projectAt: () => undefined, dispatchers: () => [] });
  const handlers = new Map<string, ChannelHandler>();
  registerSessionChannels({ handle: (channel, handler) => { handlers.set(channel, handler); } } as Channels, actions);
  const invoke = (channel: string, ...channelArguments: unknown[]) => handlers.get(channel)?.('local', ...channelArguments);
  return { actions, invoke };
}

describe('sessionActions', () => {
  it('answers project.open the started name, and rejects when the start is refused', async () => {
    const { actions } = wired();
    await expect(actions.startedMain(1)).resolves.toBe('api-1');
    await expect(actions.startedMain(1.5)).rejects.toThrow('the session to start was not one the app could read');
  });

  it('retitles a drawer rename under the folder its row ran in, not the page\'s', async () => {
    const { invoke } = wired();
    await expect(invoke('sessions:rename', 'abc', 'login fix')).resolves.toBeNull();
    expect(renameSession).toHaveBeenCalledWith('abc', 'login fix', { dir: '/api.worktrees/card' });
  });

  it('answers /rename its sentence and /rewind null on a refusal, the restored files otherwise', async () => {
    const { invoke } = wired();
    await expect(invoke('chat:rename', 1, '')).resolves.toEqual(expect.any(String));
    await expect(invoke('chat:rename', 1, 'login fix')).resolves.toBeNull();
    const point = { id: 'p1', before: null, text: 'fix it' };
    const choice = { code: true, conversation: true };
    await expect(invoke('chat:rewind', 2, point, choice)).resolves.toBeNull();
    await expect(invoke('chat:rewind', 1, point, choice)).resolves.toEqual({ canRewind: false, error: 'nothing to restore' });
  });
});
