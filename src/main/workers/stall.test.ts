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

  // Each tell, and each notice taken back, in order.
  const teller = () => {
    const said: string[] = [];
    return { said, tell: () => { said.push('told'); return () => { said.push('withdrawn'); }; } };
  };

  it('never calls a worker no hook has spoken for stalled', () => {
    const { clock, stalls } = watch();
    clock.now = 100 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 200 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
  });

  it('tells a stall once, takes it back at a sign of life, and tells the next one again', () => {
    const { clock, stalls } = watch();
    const { said, tell } = teller();
    stalls.sign('2:1');
    clock.now = 21 * MINUTE;
    expect(stalls.silentFor('2:1')).toBe(21);
    stalls.tell('2:1', tell);
    clock.now = 40 * MINUTE;
    stalls.tell('2:1', tell);
    expect(said).toEqual(['told']);
    stalls.sign('2:1');
    expect(said).toEqual(['told', 'withdrawn']);
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 60 * MINUTE;
    stalls.tell('2:1', tell);
    expect(said).toEqual(['told', 'withdrawn', 'told']);
  });

  it('forgets a worker let go of, taking its notice back, so the next one at its number starts afresh', () => {
    const { clock, stalls } = watch();
    const { said, tell } = teller();
    stalls.sign('2:1');
    clock.now = 30 * MINUTE;
    stalls.tell('2:1', tell);
    stalls.forget('2:1');
    expect(said).toEqual(['told', 'withdrawn']);
    expect(stalls.silentFor('2:1')).toBeNull();
  });
});
