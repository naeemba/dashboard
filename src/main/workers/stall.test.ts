import { describe, expect, it } from 'vitest';
import { silentMinutes, stalledState, stallRedraws, stallWatch } from './stall';

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

  it('never calls a worker no hook has spoken for stalled', () => {
    const { clock, stalls } = watch();
    clock.now = 100 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 200 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
  });

  // A sweep over the panes given, telling each stall and each machine silence into `said`.
  const sweeper = (stalls: ReturnType<typeof stallWatch>, panes: string[], said: string[], fromUser: (id: string) => boolean = () => false) => () => stalls.sweep({
    panes: () => panes,
    silentAtWork: (id) => stalls.silentFor(id),
    fromUser,
    mainOf: () => 2,
    tellPane: (id, stall) => { said.push(`${id} ${stall.minutes}${stall.tool ? ` ${stall.tool.name}` : ''}`); return () => { said.push(`${id} withdrawn`); }; },
    tellMachine: (slot, since) => { said.push(`machine ${slot} ${since / MINUTE}`); return () => { said.push('machine withdrawn'); }; },
  });

  it('tells a stall once, takes it back at a sign of life, and tells the next one again', () => {
    const { clock, stalls } = watch();
    const said: string[] = [];
    const sweep = sweeper(stalls, ['2:1'], said);
    stalls.sign('2:1');
    clock.now = 21 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 21 });
    expect(sweep()).toBe(true);
    clock.now = 40 * MINUTE;
    sweep();
    expect(said).toEqual(['2:1 21']);
    stalls.sign('2:1');
    expect(said).toEqual(['2:1 21', '2:1 withdrawn']);
    expect(stalls.silentFor('2:1')).toBeNull();
    expect(sweep()).toBe(false);
    clock.now = 60 * MINUTE;
    sweep();
    expect(said).toEqual(['2:1 21', '2:1 withdrawn', '2:1 20']);
  });

  it('lists a turn you typed stalled and never tells it', () => {
    const { clock, stalls } = watch();
    const said: string[] = [];
    stalls.sign('2:1');
    clock.now = 21 * MINUTE;
    expect(sweeper(stalls, ['2:1'], said, () => true)()).toBe(true);
    expect(said).toEqual([]);
  });

  it('forgets a worker let go of, taking its notice back, so the next one at its number starts afresh', () => {
    const { clock, stalls } = watch();
    const said: string[] = [];
    stalls.sign('2:1');
    clock.now = 30 * MINUTE;
    sweeper(stalls, ['2:1'], said)();
    stalls.forget('2:1');
    expect(said).toEqual(['2:1 30', '2:1 withdrawn']);
    expect(stalls.silentFor('2:1')).toBeNull();
  });

  it('waits out the pause ceiling for a worker inside a tool call, and names the call', () => {
    const { clock, stalls } = watch();
    stalls.sign('2:1', { toolStarted: { id: 'call-1', name: 'Bash', about: 'pnpm check' } });
    clock.now = 29 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 31 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 31, tool: { name: 'Bash', about: 'pnpm check', minutes: 31 } });
  });

  it('keeps a call while another one run beside it ends, and drops it when it or a turn ends', () => {
    const { clock, stalls } = watch();
    const call = { toolStarted: { id: 'call-1', name: 'Bash', about: '' } };
    stalls.sign('2:1', call);
    stalls.sign('2:1', { toolEnded: 'call-0' });
    clock.now = 25 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    stalls.sign('2:1', { toolEnded: 'call-1' });
    clock.now = 50 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 25 });
    stalls.sign('2:1', call);
    stalls.sign('2:1');
    clock.now = 75 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 25 });
  });

  it('tells each main once that the machine went silent, holding the stalls until something answers', () => {
    const { clock, stalls } = watch();
    const said: string[] = [];
    const sweep = sweeper(stalls, ['2:1', '2:2'], said);
    stalls.sign('2:1');
    clock.now = 2 * MINUTE;
    stalls.sign('2:2');
    clock.now = 25 * MINUTE;
    sweep();
    sweep();
    expect(said).toEqual(['machine 2 2']);
    stalls.answered();
    expect(said).toEqual(['machine 2 2', 'machine withdrawn']);
    sweep();
    expect(said).toEqual(['machine 2 2', 'machine withdrawn', '2:1 25', '2:2 23']);
  });

  it('tells each stall when something else answered since, or only one worker is silent', () => {
    const { clock, stalls } = watch();
    const said: string[] = [];
    stalls.sign('2:1');
    stalls.sign('2:2');
    clock.now = 10 * MINUTE;
    stalls.answered();
    clock.now = 25 * MINUTE;
    sweeper(stalls, ['2:1', '2:2'], said)();
    expect(said).toEqual(['2:1 25', '2:2 25']);
    const alone = watch();
    alone.stalls.sign('2:1');
    alone.clock.now = 25 * MINUTE;
    const saidAlone: string[] = [];
    sweeper(alone.stalls, ['2:1'], saidAlone)();
    expect(saidAlone).toEqual(['2:1 25']);
  });
});

describe('stalledState', () => {
  it('says the silence, and the call still running when there is one', () => {
    expect(stalledState({ minutes: 20 })).toBe('stalled, silent 20 minutes');
    expect(stalledState({ minutes: 31, tool: { name: 'Bash', about: 'pnpm check', minutes: 33 } })).toBe('stalled, silent 31 minutes, Bash running 33 minutes');
  });
});

describe('stallRedraws', () => {
  it('redraws while a worker is stalled and once on the sweep after the last stall ends', () => {
    const redraws = stallRedraws();
    expect([false, true, true, false, false].map(redraws)).toEqual([false, true, true, true, false]);
  });
});
