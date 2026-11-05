import { describe, expect, it, vi } from 'vitest';
import { NOT_RUNNING, createMeasureRefresh } from './chat-measure-refresh';

function pending<T>() {
  let settle!: { resolve: (value: T) => void; reject: (error: unknown) => void };
  const promise = new Promise<T>((resolve, reject) => { settle = { resolve, reject }; });
  return { promise, ...settle };
}

describe('createMeasureRefresh', () => {
  it('ignores a press while a read is running, and spins only for that read', async () => {
    const reading = pending<unknown>();
    const read = vi.fn(() => reading.promise);
    const busy: boolean[] = [];
    const refresh = createMeasureRefresh(read, (value) => busy.push(value), vi.fn(), vi.fn());
    refresh.refresh();
    refresh.refresh();
    expect(read).toHaveBeenCalledTimes(1);
    reading.resolve({});
    await vi.waitFor(() => expect(busy).toEqual([true, false]));
    refresh.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('says so when no session is running, and nothing when a reading lands', async () => {
    const say = vi.fn();
    const busy = vi.fn();
    createMeasureRefresh(() => Promise.resolve(null), busy, say, vi.fn()).refresh();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(say).toHaveBeenCalledWith(NOT_RUNNING);
    say.mockClear();
    createMeasureRefresh(() => Promise.resolve({}), vi.fn(), say, vi.fn()).refresh();
    await Promise.resolve();
    expect(say).not.toHaveBeenCalled();
  });

  it('hands a failed read on and stops spinning, so the next press reads again', async () => {
    const fail = vi.fn();
    const busy: boolean[] = [];
    const read = vi.fn(() => Promise.reject(new Error('gone')));
    const refresh = createMeasureRefresh(read, (value) => busy.push(value), vi.fn(), fail);
    refresh.refresh();
    await vi.waitFor(() => expect(busy).toEqual([true, false]));
    expect(fail).toHaveBeenCalledWith(new Error('gone'));
    refresh.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
