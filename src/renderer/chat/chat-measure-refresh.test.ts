import { describe, expect, it, vi } from 'vitest';
import { NOT_RUNNING, createMeasureRefresh } from './chat-measure-refresh';

describe('createMeasureRefresh', () => {
  it('says so when no session is running, and clears it when a reading lands', async () => {
    const say = vi.fn();
    const busy = vi.fn();
    createMeasureRefresh(() => Promise.resolve(null), busy, say, vi.fn()).refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(say).toHaveBeenCalledWith(NOT_RUNNING);
    say.mockClear();
    busy.mockClear();
    createMeasureRefresh(() => Promise.resolve({}), busy, say, vi.fn()).refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(say).toHaveBeenCalledWith('');
  });

  it('hands a failed read on, and stops spinning', async () => {
    const fail = vi.fn();
    const busy = vi.fn();
    createMeasureRefresh(() => Promise.reject(new Error('gone')), busy, vi.fn(), fail).refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(fail).toHaveBeenCalledWith(new Error('gone'));
  });

  it('clears a press\'s message when a later turn\'s reading lands, and nothing it did not put up', async () => {
    const say = vi.fn();
    const busy = vi.fn();
    const usage = createMeasureRefresh(() => Promise.resolve(null), busy, say, vi.fn());
    usage.landed();
    expect(say).not.toHaveBeenCalled();
    usage.refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    usage.landed();
    expect(say).toHaveBeenLastCalledWith('');
    say.mockClear();
    usage.landed();
    expect(say).not.toHaveBeenCalled();
  });

  it('clears a failed press when a later turn\'s reading lands', async () => {
    const say = vi.fn();
    const busy = vi.fn();
    const usage = createMeasureRefresh(() => Promise.reject(new Error('gone')), busy, say, vi.fn());
    usage.refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    usage.landed();
    expect(say).toHaveBeenCalledWith('');
  });
});
