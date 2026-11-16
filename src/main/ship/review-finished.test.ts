import { describe, expect, it } from 'vitest';
import { reviewFinishedAtHead } from './review-finished';

const view = (comments: { body: string; createdAt: string }[], commits: string[]) =>
  JSON.stringify({ comments, commits: commits.map((committedDate) => ({ committedDate })) });

const started = { body: 'Review loop started. Fix commits land here while it runs.', createdAt: '2026-11-16T12:50:00Z' };
const finished = { body: 'Review loop finished: floor-addressed\n\n1 round.', createdAt: '2026-11-16T15:05:00Z' };

describe('reviewFinishedAtHead', () => {
  it('is true when the loop finished after the last commit', () => {
    expect(reviewFinishedAtHead(view([started, finished], ['2026-11-16T12:40:00Z', '2026-11-16T15:00:00Z']))).toBe(true);
  });

  it('is false when a commit is dated after the loop finished', () => {
    expect(reviewFinishedAtHead(view([started, finished], ['2026-11-16T15:00:00Z', '2026-11-16T16:00:00Z']))).toBe(false);
  });

  it('is false while the loop has only started', () => {
    expect(reviewFinishedAtHead(view([started], ['2026-11-16T12:40:00Z']))).toBe(false);
  });

  it('reads the last of two finished loops', () => {
    const again = { body: 'Review loop finished: converged', createdAt: '2026-11-16T17:00:00Z' };
    expect(reviewFinishedAtHead(view([finished, again], ['2026-11-16T16:00:00Z']))).toBe(true);
  });

  it.each([['not json'], ['{}'], ['{"comments":"x"}'], ['{"comments":[null],"commits":[null]}']])('is false for what it cannot read: %s', (text) => {
    expect(reviewFinishedAtHead(text)).toBe(false);
  });
});
