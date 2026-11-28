import { describe, expect, it } from 'vitest';
import { gaveUpText, turnFailures } from './turn-failures';

// A clock moved by hand: `pass` runs every timer due by then. Fresh after 30. 2:0 stays given up.
function clock(delays = [1, 2, 5]) {
  let now = 0;
  const timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  const resumed: string[] = [];
  const gaveUp: string[] = [];
  const logged: string[] = [];
  const failures = turnFailures({
    now: () => now,
    after(ms, run) {
      const timer = { at: now + ms, run, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    resume: (id) => resumed.push(id),
    log: (id, message) => logged.push(`${id} ${message}`),
    gaveUp(id, apiError, tries) {
      gaveUp.push(`${id} ${apiError} ${tries}`);
      return id === '2:0';
    },
  }, delays, 30);
  function pass(ms: number) {
    now += ms;
    for (const timer of timers.filter((each) => !each.cancelled && each.at <= now)) {
      timer.cancelled = true;
      timer.run();
    }
  }
  return { failures, resumed, gaveUp, logged, pass };
}

describe('turnFailures', () => {
  it('sends continue after each wait in turn, then tells main once the tries are spent', () => {
    const { failures, resumed, gaveUp, pass } = clock();
    failures.failed('2:1', 'server_error');
    pass(0.5);
    expect(resumed).toEqual([]);
    pass(0.5);
    expect(resumed).toEqual(['2:1']);
    failures.failed('2:1', 'server_error');
    pass(2);
    failures.failed('2:1', 'overloaded');
    pass(5);
    expect(resumed).toEqual(['2:1', '2:1', '2:1']);
    failures.failed('2:1', 'server_error');
    pass(100);
    expect(resumed).toHaveLength(3);
    expect(gaveUp).toEqual(['2:1 server_error 3']);
  });

  it('logs each wait and each continue sent', () => {
    const { failures, logged, pass } = clock([2 * 60 * 1000]);
    failures.failed('2:0', 'server_error');
    pass(2 * 60 * 1000);
    expect(logged).toEqual([
      '2:0 turn ended on an API error (server_error): `continue` in 2 min, try 1 of 1',
      '2:0 sent `continue`, try 1 of 1',
    ]);
  });

  it('never resumes an error a wait does not fix', () => {
    const { failures, resumed, gaveUp, logged, pass } = clock();
    failures.failed('2:1', 'authentication_failed');
    pass(100);
    expect(resumed).toEqual([]);
    expect(gaveUp).toEqual([]);
    expect(logged[0]).toContain('not resumed');
  });

  it('counts afresh a failure long after the one before it', () => {
    const { failures, resumed, gaveUp, pass } = clock();
    failures.failed('2:1', 'server_error');
    pass(1);
    failures.failed('2:1', 'server_error');
    pass(2);
    failures.failed('2:1', 'server_error');
    pass(5);
    pass(31);
    failures.failed('2:1', 'server_error');
    pass(1);
    expect(resumed).toHaveLength(4);
    expect(gaveUp).toEqual([]);
  });

  it('only logs a failure after giving up on a pane that stays given up, until the window passes', () => {
    const { failures, resumed, gaveUp, pass } = clock();
    for (const id of ['2:0', '2:1']) {
      for (const wait of [1, 2, 5]) {
        failures.failed(id, 'server_error');
        pass(wait);
      }
      failures.failed(id, 'server_error');
    }
    resumed.length = 0;
    failures.failed('2:0', 'server_error');
    failures.failed('2:1', 'server_error');
    pass(10);
    expect(resumed).toEqual(['2:1']);
    expect(gaveUp).toEqual(['2:0 server_error 3', '2:1 server_error 3']);
    pass(31);
    failures.failed('2:0', 'server_error');
    pass(1);
    expect(resumed).toEqual(['2:1', '2:0']);
  });

  it('calls off the continue waiting when the pane begins a turn of its own, or is let go of', () => {
    const { failures, resumed, pass } = clock();
    failures.failed('2:1', 'server_error');
    failures.working('2:1');
    failures.failed('2:2', 'server_error');
    failures.forget('2:2');
    pass(100);
    expect(resumed).toEqual([]);
  });

  it('keeps each pane its own count', () => {
    const { failures, resumed, pass } = clock();
    failures.failed('2:1', 'server_error');
    failures.failed('2:2', 'server_error');
    pass(1);
    expect(resumed).toEqual(['2:1', '2:2']);
  });
});

describe('gaveUpText', () => {
  it('names the pane, the error and the tries, and what main can do', () => {
    expect(gaveUpText('dashboard 1', '2:1', 'server_error', 4)).toBe(
      'dashboard 1 (2:1) ended its turn on an API error (server_error) again after the app sent it'
        + ' `continue` 4 times, and the app has stopped trying. Send it `continue` once the API answers again.',
    );
  });
});
