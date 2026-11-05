import { describe, expect, it } from 'vitest';
import { stopNotices } from './stop-notices';

// A clock moved by hand: `pass` runs every timer due by then.
function clock() {
  let now = 0;
  const timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  const noticed: string[] = [];
  const notices = stopNotices({
    after(ms, run) {
      const timer = { at: now + ms, run, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    notice: (id) => { noticed.push(id); },
  }, 100);
  function pass(ms: number) {
    now += ms;
    for (const timer of timers.filter((each) => !each.cancelled && each.at <= now)) {
      timer.cancelled = true;
      timer.run();
    }
  }
  return { notices, noticed, pass };
}

describe('stopNotices', () => {
  it('tells main once a worker has stayed stopped for the whole grace period', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    pass(99);
    expect(noticed).toEqual([]);
    pass(1);
    expect(noticed).toEqual(['2:1']);
  });

  it('says nothing for a pause the worker wakes from inside the grace period', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    pass(50);
    notices.state('2:1', 'running');
    pass(200);
    expect(noticed).toEqual([]);
  });

  it('starts the grace period again at each turn end', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    pass(80);
    notices.state('2:1', 'done');
    pass(80);
    expect(noticed).toEqual([]);
    pass(20);
    expect(noticed).toEqual(['2:1']);
  });

  it('gives one notice per stop, and another only after the worker worked again', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    pass(100);
    notices.state('2:1', 'done');
    pass(100);
    expect(noticed).toEqual(['2:1']);
    notices.state('2:1', 'running');
    notices.state('2:1', 'done');
    pass(100);
    expect(noticed).toEqual(['2:1', '2:1']);
  });

  it('says nothing for a stop the worker reported, before or after it', () => {
    const { notices, noticed, pass } = clock();
    notices.reported('2:1');
    notices.state('2:1', 'running');
    notices.state('2:1', 'done');
    pass(100);
    notices.state('2:2', 'done');
    pass(50);
    notices.reported('2:2');
    pass(100);
    expect(noticed).toEqual([]);
    // The report covered one stop, not every one after it.
    notices.state('2:1', 'running');
    notices.state('2:1', 'done');
    pass(100);
    expect(noticed).toEqual(['2:1']);
  });

  it('keeps no report read after its stop was noticed, so the next stop is still told', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    pass(100);
    notices.reported('2:1');
    notices.state('2:1', 'running');
    notices.state('2:1', 'done');
    pass(100);
    expect(noticed).toEqual(['2:1', '2:1']);
  });

  it('says nothing for a stop that turns into a permission ask, or a worker forgotten', () => {
    const { notices, noticed, pass } = clock();
    notices.state('2:1', 'done');
    notices.state('2:1', 'blocked');
    notices.state('2:2', 'done');
    notices.forget('2:2');
    pass(100);
    expect(noticed).toEqual([]);
  });
});
