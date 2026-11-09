import { describe, expect, it } from 'vitest';
import { stopNotices } from './stop-notices';

// A clock moved by hand: `pass` runs every timer due by then.
function clock() {
  let now = 0;
  const timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  const noticed: string[] = [];
  const paused: string[] = [];
  const takenBack: string[] = [];
  // The workers whose main is mid-turn.
  const busy = new Set<string>();
  const notices = stopNotices({
    midTurn: (id) => busy.has(id),
    after(ms, run) {
      const timer = { at: now + ms, run, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    notice: (id, pause) => {
      noticed.push(id);
      if (pause) paused.push(id);
      return () => { takenBack.push(id); };
    },
  }, 100, 10, 1000);
  function pass(ms: number) {
    now += ms;
    for (const timer of timers.filter((each) => !each.cancelled && each.at <= now)) {
      timer.cancelled = true;
      timer.run();
    }
  }
  return { notices, noticed, paused, takenBack, busy, pass };
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

  describe('with a Stop hook that says what the session waits on', () => {
    const nothing = { background: 0, scheduled: 0 };

    it('tells main as soon as the report has had time to land, and gives no grace period', () => {
      const { notices, noticed, pass } = clock();
      notices.state('2:1', 'done', nothing);
      pass(9);
      expect(noticed).toEqual([]);
      pass(1);
      expect(noticed).toEqual(['2:1']);
    });

    it('says nothing for a stop that still waits on background work or a wakeup, until one that waits on nothing', () => {
      const { notices, noticed, pass } = clock();
      notices.state('2:1', 'done', { background: 2, scheduled: 0 });
      notices.state('2:2', 'done', { background: 0, scheduled: 1 });
      pass(900);
      expect(noticed).toEqual([]);
      // The task woke it and it ended again without running a tool.
      notices.state('2:1', 'done', nothing);
      pass(10);
      expect(noticed).toEqual(['2:1']);
    });

    it('says nothing for a stop whose report main read in time, even one sent before a pause', () => {
      const { notices, noticed, pass } = clock();
      notices.state('2:1', 'done', nothing);
      pass(5);
      notices.reported('2:1');
      notices.reported('2:2');
      notices.state('2:2', 'done', { background: 1, scheduled: 0 });
      notices.state('2:2', 'done', nothing);
      pass(100);
      expect(noticed).toEqual([]);
    });

    it('tells main once a pause has lasted the ceiling, since nothing may ever wake it', () => {
      const { notices, noticed, paused, pass } = clock();
      notices.state('2:1', 'done', { background: 1, scheduled: 0 });
      notices.reported('2:2');
      notices.state('2:2', 'done', { background: 1, scheduled: 0 });
      pass(1000);
      expect(paused).toEqual(['2:1']);
      // Still the same pause: told once.
      notices.state('2:1', 'done', { background: 1, scheduled: 0 });
      pass(1000);
      expect(noticed).toEqual(['2:1']);
      // Woken at last and ended with nothing in flight: main heard only that it waits, so this stop
      // is told too, as a stop.
      notices.state('2:1', 'done', nothing);
      pass(10);
      expect(noticed).toEqual(['2:1', '2:1']);
      expect(paused).toEqual(['2:1']);
    });

    it('takes back a notice main has queued when the report is read after it', () => {
      const { notices, noticed, takenBack, pass } = clock();
      notices.state('2:1', 'done', nothing);
      pass(10);
      notices.reported('2:1');
      expect(noticed).toEqual(['2:1']);
      expect(takenBack).toEqual(['2:1']);
      // Taken back once: a second read of a report has nothing left to take back.
      notices.reported('2:1');
      expect(takenBack).toEqual(['2:1']);
    });
    // Main reads a report only when its turn ends (chat-sessions.ts hears the sender on the turn's
    // result), and the turn that read it merges and releases, which outlasts the settle.
    describe('when main releases the worker', () => {
      it('tells the next worker in the same pane of its own stop, and nothing of the last one\'s', () => {
        const { notices, noticed, takenBack, pass } = clock();
        notices.state('2:1', 'done', nothing);
        pass(10);
        notices.forget('2:1');
        notices.state('2:1', 'running');
        pass(1000);
        expect(noticed).toEqual(['2:1']);
        notices.state('2:1', 'done', nothing);
        pass(10);
        expect(noticed).toEqual(['2:1', '2:1']);
        expect(takenBack).toEqual(['2:1']);
      });
    });

    // Queued, a notice main takes the moment its turn ends, before the app reads that turn's result.
    describe('while main is mid-turn', () => {
      it('holds the notice and drops it when the turn read the worker\'s report', () => {
        const { notices, noticed, busy, pass } = clock();
        busy.add('2:1');
        notices.state('2:1', 'done', nothing);
        pass(10);
        expect(noticed).toEqual([]);
        notices.reported('2:1');
        busy.delete('2:1');
        notices.turnOver();
        expect(noticed).toEqual([]);
      });

      it('tells the notice when the turn ends without the report, and only to that main', () => {
        const { notices, noticed, paused, busy, pass } = clock();
        busy.add('2:1');
        busy.add('3:1');
        notices.state('2:1', 'done', nothing);
        notices.state('3:1', 'done', { background: 1, scheduled: 0 });
        pass(1000);
        busy.delete('3:1');
        notices.turnOver();
        expect(noticed).toEqual(['3:1']);
        expect(paused).toEqual(['3:1']);
        busy.delete('2:1');
        notices.turnOver();
        expect(noticed).toEqual(['3:1', '2:1']);
        // Told once: a second turn end has nothing held.
        notices.turnOver();
        expect(noticed).toHaveLength(2);
      });

      it('drops a held notice when the worker works again or is forgotten', () => {
        const { notices, noticed, busy, pass } = clock();
        busy.add('2:1');
        busy.add('2:2');
        notices.state('2:1', 'done', nothing);
        notices.state('2:2', 'done', nothing);
        pass(10);
        notices.state('2:1', 'running');
        notices.forget('2:2');
        notices.turnOver();
        expect(noticed).toEqual([]);
      });

      it('tells only the stop when a held pause is followed by a stop in the same turn', () => {
        const { notices, noticed, paused, busy, pass } = clock();
        busy.add('2:1');
        notices.state('2:1', 'done', { background: 1, scheduled: 0 });
        pass(1000);
        // The turn ends before the stop comes due: the pause it replaced is no longer held.
        notices.state('2:1', 'done', nothing);
        busy.delete('2:1');
        notices.turnOver();
        pass(2000);
        expect(noticed).toEqual(['2:1']);
        expect(paused).toEqual([]);
      });
    });
  });
});
