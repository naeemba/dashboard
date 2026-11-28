import { describe, expect, it } from 'vitest';
import { DIRTY_WAIT_MS, dirtyWaitNotice, dirtyWaits, namedFiles } from './dirty-wait';

describe('dirtyWaits', () => {
  it('answers true once, when the wait passes the limit', () => {
    const waits = dirtyWaits();
    expect(waits.waited('a', 1000)).toBe(false);
    expect(waits.waited('a', 1000 + DIRTY_WAIT_MS - 1)).toBe(false);
    expect(waits.waited('a', 1000 + DIRTY_WAIT_MS)).toBe(true);
    expect(waits.waited('a', 1000 + 2 * DIRTY_WAIT_MS)).toBe(false);
  });

  it('starts a new spell after clear, and keeps cards apart', () => {
    const waits = dirtyWaits();
    waits.waited('a', 0);
    waits.waited('b', 0);
    waits.clear('a');
    expect(waits.waited('a', DIRTY_WAIT_MS)).toBe(false);
    expect(waits.waited('b', DIRTY_WAIT_MS)).toBe(true);
    expect(waits.waited('a', 2 * DIRTY_WAIT_MS)).toBe(true);
  });
});

describe('namedFiles', () => {
  it('names up to five and counts the rest', () => {
    expect(namedFiles(['a', 'b'])).toBe('a, b');
    expect(namedFiles(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('a, b, c, d, e and 2 more');
  });
});

it('names the pull request, the folder and the files in the notice', () => {
  const notice = dirtyWaitNotice({ cardId: 'c1', title: 'Fix it', pullRequest: 61, worktreePath: '/w/fix-it', files: ['src/a.ts'] });
  expect(notice).toContain('"Fix it" (pull request #61)');
  expect(notice).toContain('in /w/fix-it, and its worker is idle: src/a.ts.');
  expect(notice).toContain('card c1');
});
