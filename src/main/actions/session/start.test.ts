import { describe, expect, it, vi } from 'vitest';
import { bind } from '../action';
import { sessionStart } from './start';

describe('session.start', () => {
  it('starts a main at a restart only when a worker that came back reports to it', async () => {
    const start = vi.fn(async () => 'api-main');
    const projects: Record<number, { path: string; missing: boolean }> = { 1: { path: '/api', missing: false }, 2: { path: '/web', missing: false }, 3: { path: '/api', missing: true } };
    const session = bind(sessionStart, { projectAt: (slot) => projects[slot], dispatchers: () => ['/api'], start });
    await expect(session.call({ slot: 1, from: 'restart' })).resolves.toEqual({ output: 'api-main is running', name: 'api-main' });
    await expect(session.call({ slot: 2, from: 'restart' })).resolves.toEqual({ output: 'waits to be shown', name: null });
    await session.call({ slot: 3, from: 'restart' });
    await session.call({ slot: 7, from: 'restart' });
    expect(start.mock.calls).toEqual([[1]]);
  });

  it('starts a kept screen and the command\'s main whatever the restart would say, and has it running when call returns', () => {
    const start = vi.fn(() => new Promise<string>(() => undefined));
    const session = bind(sessionStart, { projectAt: () => undefined, dispatchers: () => [], start });
    void session.call({ slot: -4, from: 'kept' });
    void session.call({ slot: 2, from: 'command' });
    expect(start.mock.calls).toEqual([[-4], [2]]);
  });
});
