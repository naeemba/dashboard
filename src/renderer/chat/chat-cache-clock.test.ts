import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCacheClock } from './chat-cache-clock';
import type { CacheUse } from '../../shared/usage/cache-warmth';

const NOW = new Date(2026, 8, 14, 9, 0, 30).getTime();
const warm: CacheUse = { at: NOW, tier: '5m' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCacheClock', () => {
  it('keeps one redraw pending however many times it is read', () => {
    const redraw = vi.fn();
    const clock = createCacheClock(() => true, redraw);
    clock.read(warm);
    clock.read(warm);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersToNextTimer();
    expect(redraw).toHaveBeenCalledTimes(1);
  });

  it('schedules again after its timer fires', () => {
    const clock = createCacheClock(() => true, () => clock.read(warm));
    clock.read(warm);
    vi.advanceTimersToNextTimer();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('sleeps after a tick off screen until woken and read again', () => {
    const redraw = vi.fn();
    let visible = false;
    const clock = createCacheClock(() => visible, redraw);
    clock.read(warm);
    vi.advanceTimersToNextTimer();
    expect(redraw).not.toHaveBeenCalled();
    clock.read(warm);
    expect(vi.getTimerCount()).toBe(0);
    visible = true;
    clock.wake();
    clock.read(warm);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('schedules nothing once cold', () => {
    const clock = createCacheClock(() => true, vi.fn());
    expect(clock.read({ at: NOW - 10 * 60_000, tier: '5m' })?.text).toBe('cold');
    clock.read(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});
