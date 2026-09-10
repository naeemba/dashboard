import { describe, expect, it } from 'vitest';
import { looksBusy, marksWaiting, raisesNotification, redrawsForBell, waitingNames } from './waiting';

describe('looksBusy', () => {
  it('reads an agent still working from the seconds after its spinner', () => {
    expect(looksBusy(['✳ Coalescing… (5s · thinking with high effort)'])).toBe(true);
  });

  it('reads it from the key that stops it', () => {
    expect(looksBusy(['✻ Reticulating… (esc to interrupt)'])).toBe(true);
  });

  // The spinner sits above the input box, which is three lines on its own.
  it('finds the spinner above what the agent draws under it', () => {
    expect(looksBusy([
      '✳ Coalescing… (5s)', '', '╭────────╮', '│ >      │', '╰────────╯', '  auto mode on',
    ])).toBe(true);
  });

  // Every pane's bell comes through here, and a shell that prints its own seconds is not a spinner.
  it('leaves a build that printed how long it took', () => {
    expect(looksBusy(['built in (12s)', 'error: 1 test failed'])).toBe(false);
  });

  it('leaves a pane that is really asking', () => {
    expect(looksBusy(['Do you want to make this edit?', '❯ 1. Yes', '  2. No'])).toBe(false);
  });

  it('leaves an empty screen', () => {
    expect(looksBusy([])).toBe(false);
  });
});

describe('marksWaiting', () => {
  it('ignores the pane you are looking at', () => {
    expect(marksWaiting(true, true)).toBe(false);
  });

  it('marks another pane while you are in the app', () => {
    expect(marksWaiting(true, false)).toBe(true);
  });

  it('marks any pane while the window is behind something else', () => {
    expect(marksWaiting(false, true)).toBe(true);
    expect(marksWaiting(false, false)).toBe(true);
  });
});

describe('raisesNotification', () => {
  it('stays quiet while the window is in front', () => {
    expect(raisesNotification(true, 'quiet')).toBe(false);
    expect(raisesNotification(true, 'waiting')).toBe(false);
  });

  it('raises one banner for the first bell', () => {
    expect(raisesNotification(false, 'quiet')).toBe(true);
  });

  it('does not repeat itself while the mark is still up', () => {
    expect(raisesNotification(false, 'notified')).toBe(false);
  });

  it('still banners a pane that was marked while you were in the app', () => {
    expect(raisesNotification(false, 'waiting')).toBe(true);
  });
});

describe('redrawsForBell', () => {
  it('draws the first bell wherever you are', () => {
    expect(redrawsForBell('quiet', false)).toBe(true);
  });

  it('ignores a repeat bell on a page that only shows the mark', () => {
    expect(redrawsForBell('waiting', false)).toBe(false);
    expect(redrawsForBell('notified', false)).toBe(false);
  });

  // The row prints the pane's last lines, so a repeat bell has replaced what it is showing.
  it('draws a repeat bell on the manager, where the question itself is on screen', () => {
    expect(redrawsForBell('waiting', true)).toBe(true);
    expect(redrawsForBell('notified', true)).toBe(true);
  });
});

describe('waitingNames', () => {
  it('names every pane that is asking, in pane order', () => {
    expect(waitingNames([
      { bell: 'quiet', name: 'terminal 1' },
      { bell: 'waiting', name: 'terminal 2' },
      { bell: 'quiet', name: 'terminal 3' },
      { bell: 'notified', name: 'nvim' },
    ])).toEqual(['terminal 2', 'nvim']);
  });

  it('says nothing when no pane is asking', () => {
    expect(waitingNames([{ bell: 'quiet', name: 'terminal 1' }])).toEqual([]);
  });
});
