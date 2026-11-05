import { describe, expect, it, vi } from 'vitest';
import { singleFlight } from './single-flight';

describe('singleFlight', () => {
  it('ignores a press while a read is running, and spins only for that read', async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const busy: boolean[] = [];
    const refresh = singleFlight(run, (value) => busy.push(value));
    refresh();
    refresh();
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(busy).toEqual([true, false]));
    refresh();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('ends the spin when the read rejects, so the next press reads again', async () => {
    const run = vi.fn(() => Promise.reject(new Error('gone')));
    const busy: boolean[] = [];
    const refresh = singleFlight(run, (value) => busy.push(value));
    refresh();
    await vi.waitFor(() => expect(busy).toEqual([true, false]));
    refresh();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
