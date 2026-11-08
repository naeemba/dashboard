import { describe, expect, it, vi } from 'vitest';
import { bind } from '../action';
import { sessionConfigure } from './configure';

describe('session.configure', () => {
  it('keeps the choice, moves a running session onto it, and starts none', async () => {
    const running = { setModel: vi.fn(async () => undefined), setPermissionMode: vi.fn(async () => undefined), applyFlagSettings: vi.fn(async () => undefined) };
    const choose = vi.fn();
    const configure = bind(sessionConfigure, { choose, session: (slot) => (slot === 1 ? Promise.resolve(running) : undefined) });
    await configure.call({ slot: 1, change: { model: null, effort: 'high' } });
    expect(running.setModel).toHaveBeenCalledWith(undefined);
    expect(running.setPermissionMode).not.toHaveBeenCalled();
    expect(running.applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'high' });
    await expect(configure.call({ slot: 2, change: { fast: true } })).resolves.toEqual({ output: 'kept for the next start' });
    expect(choose.mock.calls).toEqual([[1, { model: null, effort: 'high' }], [2, { fast: true }]]);
  });
});
