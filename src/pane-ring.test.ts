import { describe, expect, it } from 'vitest';
import { paneRing } from './pane-ring';

describe('paneRing', () => {
  it('replays what was pushed, after a reset', () => {
    const ring = paneRing(100);
    ring.push('one ');
    ring.push('two');
    expect(ring.replay()).toBe('\x1bcone two');
  });

  it('replays nothing when nothing was pushed', () => {
    expect(paneRing(100).replay()).toBe('');
  });

  it('remembers how its shell ended', () => {
    const ring = paneRing(100);
    expect(ring.exitCode()).toBeUndefined();
    ring.exit(127);
    expect(ring.exitCode()).toBe(127);
  });

  it('keeps only the tail once over its limit', () => {
    const ring = paneRing(5);
    ring.push('abcdefgh');
    ring.push('ij');
    expect(ring.replay()).toBe('\x1bcfghij');
  });
});
