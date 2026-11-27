import { describe, expect, it } from 'vitest';
import { silentMinutes, stallWatch } from './stall';

const MINUTE = 60_000;

describe('silentMinutes', () => {
  it('is null until the silence reaches the setting, then the whole minutes', () => {
    expect(silentMinutes(0, 19 * MINUTE + 59_999, 20)).toBeNull();
    expect(silentMinutes(0, 20 * MINUTE, 20)).toBe(20);
    expect(silentMinutes(0, 27.5 * MINUTE, 20)).toBe(27);
  });
});

describe('stallWatch', () => {
  const watch = () => {
    const clock = { now: 0 };
    return { clock, stalls: stallWatch(() => 20, () => clock.now) };
  };

  it('starts a worker no hook has spoken for at the first look', () => {
    const { clock, stalls } = watch();
    clock.now = 100 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 120 * MINUTE;
    expect(stalls.silentFor('2:1')).toBe(20);
  });

  it('tells a stall once, and again only after a sign of life', () => {
    const { clock, stalls } = watch();
    stalls.sign('2:1');
    clock.now = 19 * MINUTE;
    expect(stalls.tellNow('2:1')).toBe(false);
    clock.now = 21 * MINUTE;
    expect(stalls.tellNow('2:1')).toBe(true);
    clock.now = 40 * MINUTE;
    expect(stalls.tellNow('2:1')).toBe(false);
    stalls.sign('2:1');
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 60 * MINUTE;
    expect(stalls.tellNow('2:1')).toBe(true);
  });

  it('forgets a worker let go of, so the next one at its number starts afresh', () => {
    const { clock, stalls } = watch();
    stalls.sign('2:1');
    clock.now = 30 * MINUTE;
    expect(stalls.tellNow('2:1')).toBe(true);
    stalls.forget('2:1');
    expect(stalls.silentFor('2:1')).toBeNull();
  });
});
