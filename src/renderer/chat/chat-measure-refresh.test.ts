import { describe, expect, it, vi } from 'vitest';
import { NOT_RUNNING, createMeasureRefresh } from './chat-measure-refresh';

describe('createMeasureRefresh', () => {
  it('says so when no session is running, and clears it when a reading lands', async () => {
    const say = vi.fn();
    const busy = vi.fn();
    createMeasureRefresh(() => Promise.resolve(null), busy, say, vi.fn())();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(say).toHaveBeenCalledWith(NOT_RUNNING);
    say.mockClear();
    busy.mockClear();
    createMeasureRefresh(() => Promise.resolve({}), busy, say, vi.fn())();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(say).toHaveBeenCalledWith('');
  });

  it('hands a failed read on, and stops spinning', async () => {
    const fail = vi.fn();
    const busy = vi.fn();
    createMeasureRefresh(() => Promise.reject(new Error('gone')), busy, vi.fn(), fail)();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(fail).toHaveBeenCalledWith(new Error('gone'));
  });
});
