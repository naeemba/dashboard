import { describe, expect, it } from 'vitest';
import { marksWaiting, raisesNotification, waitingNames } from './waiting';

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
