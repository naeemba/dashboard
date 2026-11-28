import { describe, expect, it } from 'vitest';
import { silentMinutes, stalledState, stallRedraws, stallWatch, type StallSweepPorts } from './stall';

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

  // A sweep over the panes given, telling each stall and each machine silence into `said`, once the
  // clock has been moved on to `minute` a sweep a minute, as the app's interval does while awake.
  type Watch = ReturnType<typeof watch>;
  const sweeper = ({ clock, stalls }: Watch, panes: string[], said: string[], fromUser: (id: string) => boolean = () => false) => (minute: number) => {
    const ports = (shown: string[]): StallSweepPorts => ({
      panes: () => shown,
      silentAtWork: (id) => stalls.silentFor(id),
      fromUser,
      mainOf: () => 2,
      tellPane: (id, stall) => { said.push(`${id} ${stall.minutes}${stall.tool ? ` ${stall.tool.name}` : ''}`); return () => { said.push(`${id} withdrawn`); }; },
      tellMachine: (slot, since) => { said.push(`machine ${slot} ${since / MINUTE}`); return () => { said.push('machine withdrawn'); }; },
    });
    for (; clock.now < (minute - 1) * MINUTE; clock.now += MINUTE) stalls.sweep(ports([]));
    clock.now = minute * MINUTE;
    return stalls.sweep(ports(panes));
  };

  it('tells a stall once, takes it back at a sign of life, and tells the next one again', () => {
    const watched = watch();
    const { stalls } = watched;
    const said: string[] = [];
    const sweep = sweeper(watched, ['2:1'], said);
    stalls.sign('2:1');
    expect(sweep(21)).toBe(true);
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 21 });
    sweep(40);
    expect(said).toEqual(['2:1 21']);
    stalls.sign('2:1');
    expect(said).toEqual(['2:1 21', '2:1 withdrawn']);
    expect(stalls.silentFor('2:1')).toBeNull();
    expect(sweep(40)).toBe(false);
    sweep(60);
    expect(said).toEqual(['2:1 21', '2:1 withdrawn', '2:1 20']);
  });

  it('lists a turn you typed stalled and never tells it', () => {
    const watched = watch();
    const said: string[] = [];
    watched.stalls.sign('2:1');
    expect(sweeper(watched, ['2:1'], said, () => true)(21)).toBe(true);
    expect(said).toEqual([]);
  });

  it('forgets a worker let go of, taking its notice back, so the next one at its number starts afresh', () => {
    const watched = watch();
    const { stalls } = watched;
    const said: string[] = [];
    stalls.sign('2:1');
    sweeper(watched, ['2:1'], said)(30);
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

  it('keeps each call run side by side until its own end, naming the oldest, and drops them all when a turn ends', () => {
    const { clock, stalls } = watch();
    const test = { toolStarted: { id: 'call-1', name: 'Bash', about: 'pnpm test' } };
    stalls.sign('2:1', test);
    clock.now = 24 * MINUTE;
    stalls.sign('2:1', { toolStarted: { id: 'call-2', name: 'Bash', about: 'pnpm typecheck' } });
    stalls.sign('2:1', { toolEnded: 'call-2' });
    clock.now = 50 * MINUTE;
    expect(stalls.silentFor('2:1')).toBeNull();
    clock.now = 55 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 31, tool: { name: 'Bash', about: 'pnpm test', minutes: 55 } });
    stalls.sign('2:1', { toolEnded: 'call-1' });
    clock.now = 80 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 25 });
    stalls.sign('2:1', test);
    stalls.sign('2:1');
    clock.now = 105 * MINUTE;
    expect(stalls.silentFor('2:1')).toEqual({ minutes: 25 });
  });

  it('tells each main once that the machine was away, on the first sweep after a gap, holding the stalls to the next', () => {
    const watched = watch();
    const { clock, stalls } = watched;
    const said: string[] = [];
    const sweep = sweeper(watched, ['2:1', '2:2'], said);
    stalls.sign('2:1');
    stalls.sign('2:2');
    sweep(5);
    // Asleep from minute 5 to 40: no sweep ran.
    clock.now = 40 * MINUTE;
    expect(stalls.sweep({
      panes: () => ['2:1', '2:2'], silentAtWork: (id) => stalls.silentFor(id), fromUser: () => false, mainOf: () => 2,
      tellPane: (id) => { said.push(id); return () => {}; },
      tellMachine: (slot, since) => { said.push(`machine ${slot} ${since / MINUTE}`); return () => { said.push('machine withdrawn'); }; },
    })).toBe(true);
    expect(said).toEqual(['machine 2 5']);
    stalls.sign('2:1');
    expect(said).toEqual(['machine 2 5', 'machine withdrawn']);
    sweep(41);
    expect(said).toEqual(['machine 2 5', 'machine withdrawn', '2:2 41']);
  });

  it('tells every stall on sweeps a minute apart, however many workers are silent at once', () => {
    const watched = watch();
    const said: string[] = [];
    watched.stalls.sign('2:1');
    watched.stalls.sign('2:2');
    sweeper(watched, ['2:1', '2:2'], said)(30);
    expect(said).toEqual(['2:1 30', '2:2 30']);
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
