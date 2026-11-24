import { describe, expect, it } from 'vitest';
import { answeringPrograms, remoteAt } from '../testing/answering-programs';
import { mergeRequestFinishedAtHead, reviewFinished, reviewFinishedAtHead } from './review-finished';

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

// GitLab's notes and commits, as its API names their dates.
const notes = (...said: { body: string; createdAt: string }[]) => JSON.stringify(said.map(({ body, createdAt }) => ({ body, created_at: createdAt })));
const commits = (...dates: string[]) => JSON.stringify(dates.map((committed_date) => ({ committed_date })));

describe('mergeRequestFinishedAtHead', () => {
  it('reads the loop\'s note the way it reads a comment', () => {
    expect(mergeRequestFinishedAtHead(notes(finished, started), commits('2026-11-16T15:00:00Z'))).toBe(true);
    expect(mergeRequestFinishedAtHead(notes(finished), commits('2026-11-16T15:10:00Z'))).toBe(false);
  });

  it('is false for what it cannot read', () => {
    expect(mergeRequestFinishedAtHead('not json', '[]')).toBe(false);
  });
});

describe('reviewFinished', () => {
  const run = (url: string) => answeringPrograms({
    ...remoteAt(url),
    'glab api projects/:id/merge_requests/12/notes': notes(finished),
    'glab api projects/:id/merge_requests/12/commits': commits('2026-11-16T15:00:00Z'),
  });

  it('asks glab on a GitLab project', async () => {
    expect(await reviewFinished(run('git@git.arr.lan:fe/app.git'), '/w', 12, 1000)).toBe(true);
  });

  // gh is not answering here: not knowing starts the review.
  it('is false when the forge cannot answer', async () => {
    expect(await reviewFinished(run('git@github.com:me/app.git'), '/w', 12, 1000)).toBe(false);
  });
});
