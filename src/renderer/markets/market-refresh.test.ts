import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketRefresh } from './market-refresh';

const INTERVAL = 1_000;

// A read that stays open until the test lets it finish.
function pendingReads(): {
  read: () => Promise<void>; count: () => number; finish: () => Promise<void>; fail: () => Promise<void>;
} {
  const waiting: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const settle = async (how: 'resolve' | 'reject'): Promise<void> => {
    const next = waiting.shift();
    if (how === 'resolve') next?.resolve(); else next?.reject(new Error('read failed'));
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    read: () => new Promise<void>((resolve, reject) => { waiting.push({ resolve, reject }); }),
    count: () => waiting.length,
    finish: () => settle('resolve'),
    fail: () => settle('reject'),
  };
}

describe('createMarketRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('ignores a refresh while a read is running, and says when it is busy', async () => {
    const reads = pendingReads();
    const busy: boolean[] = [];
    const card = createMarketRefresh(reads.read, INTERVAL, (value) => busy.push(value));
    card.refresh();
    card.refresh();
    expect(reads.count()).toBe(1);
    await reads.finish();
    expect(busy).toEqual([true, false]);
    card.refresh();
    expect(reads.count()).toBe(1);
  });

  it('reads again an interval after the last read finished', async () => {
    const reads = pendingReads();
    createMarketRefresh(reads.read, INTERVAL, () => {}).refresh();
    await reads.finish();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(reads.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.count()).toBe(1);
  });

  it('counts the interval from a manual refresh, not from the read before it', async () => {
    const reads = pendingReads();
    const card = createMarketRefresh(reads.read, INTERVAL, () => {});
    card.refresh();
    await reads.finish();
    await vi.advanceTimersByTimeAsync(INTERVAL - 10);
    card.refresh();
    await reads.finish();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(reads.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.count()).toBe(1);
  });

  it('ends the spin and schedules the next read when a read rejects', async () => {
    const reads = pendingReads();
    const busy: boolean[] = [];
    createMarketRefresh(reads.read, INTERVAL, (value) => busy.push(value)).refresh();
    await reads.fail();
    expect(busy).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(reads.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.count()).toBe(1);
  });
});
