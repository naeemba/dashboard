import { describe, expect, it } from 'vitest';
import { paneRing } from './pane-ring';

describe('paneRing', () => {
  it('replays what was pushed, after a reset', () => {
    const ring = paneRing(100);
    ring.push('one ');
    ring.push('two');
    expect(ring.replay()).toBe('\x1bcone two');
  });

  it('keeps only the tail once over its limit', () => {
    const ring = paneRing(5);
    ring.push('abcdefgh');
    ring.push('ij');
    expect(ring.replay()).toBe('\x1bcfghij');
  });

  it('is empty after a clear', () => {
    const ring = paneRing(5);
    ring.push('abc');
    ring.clear();
    expect(ring.replay()).toBe('\x1bc');
  });
});
