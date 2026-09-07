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
    expect(raisesNotification(true, false)).toBe(false);
  });

  it('raises one banner for the first bell', () => {
    expect(raisesNotification(false, false)).toBe(true);
  });

  it('does not repeat itself while the mark is still up', () => {
    expect(raisesNotification(false, true)).toBe(false);
  });
});

describe('waitingNames', () => {
  it('names every pane that is asking, in pane order', () => {
    expect(waitingNames([
      { waiting: false, name: 'terminal 1' },
      { waiting: true, name: 'terminal 2' },
      { waiting: false, name: 'terminal 3' },
      { waiting: true, name: 'nvim' },
    ])).toEqual(['terminal 2', 'nvim']);
  });

  it('says nothing when no pane is asking', () => {
    expect(waitingNames([{ waiting: false, name: 'terminal 1' }])).toEqual([]);
  });
});
