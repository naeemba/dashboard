import { describe, expect, it } from 'vitest';
import { cardById, columnNamed, emptyBoard, type Board, type Card } from '../../shared/board/board';
import {
  DONE_FOLLOWED_MS, followStep, isFollowed, latestPullRequest, pullRequestComment, type PullRequest,
} from './pull-request-column';

const NOW = Date.parse('2026-11-09T12:00:00Z');

function boardWith(column: string, fields: Partial<Card> = {}): Board {
  const board = emptyBoard();
  const card: Card = { id: 'card', title: 'Fix login', notes: '', priority: 'medium', parent: null, ...fields };
  board.columns[columnNamed(board, column)].cards.push(card);
  return board;
}

function pull(state: PullRequest['state'], number = 12): PullRequest {
  return { number, state, title: 'Fix the login race', url: `https://github.com/o/r/pull/${number}` };
}

function said(state: PullRequest['state'], number = 12) {
  return { body: pullRequestComment(pull(state, number)) };
}

function card(board: Board | null): Card | undefined {
  return board === null ? undefined : cardById(board, 'card');
}

describe('latestPullRequest', () => {
  it('takes an open pull request over a newer closed one, else the newest', () => {
    const closed = pull('CLOSED', 13);
    expect(latestPullRequest(JSON.stringify([closed, pull('OPEN')]))).toEqual(pull('OPEN'));
    expect(latestPullRequest(JSON.stringify([closed, pull('MERGED')]))).toEqual(closed);
    expect(latestPullRequest('[]')).toBeNull();
    expect(latestPullRequest(JSON.stringify([{ number: 'x' }]))).toBeNull();
    expect(() => latestPullRequest('gh: not logged in')).toThrow();
  });
});

describe('isFollowed', () => {
  const followed = (column: string, fields: Partial<Card> = {}, branch: string | undefined = 'fix-login') =>
    isFollowed(card(boardWith(column, fields))!, column, branch, NOW);
  const branchless = isFollowed(card(boardWith('Doing'))!, 'Doing', undefined, NOW);

  it('asks about a card with a branch, never one without or one cancelled', () => {
    expect(followed('Doing')).toBe(true);
    expect(branchless).toBe(false);
    expect(followed('Cancelled')).toBe(false);
  });

  it('stops once the merge is on the card', () => {
    expect(followed('Review', { pullRequest: 12, comments: [said('MERGED')] })).toBe(false);
    expect(followed('Review', { pullRequest: 12, comments: [said('OPEN')] })).toBe(true);
  });

  it('asks about a Done card only for a day after it last changed', () => {
    const at = (ago: number) => new Date(NOW - ago).toISOString();
    expect(followed('Done', { updatedAt: at(DONE_FOLLOWED_MS - 1000) })).toBe(true);
    expect(followed('Done', { updatedAt: at(DONE_FOLLOWED_MS + 1000) })).toBe(false);
    expect(followed('Done')).toBe(false);
  });
});

describe('followStep', () => {
  it('moves a card into Review when its pull request opens, recording it and saying so once', () => {
    const step = followStep(boardWith('Doing'), 'card', 'fix-login', pull('OPEN'));
    expect(step.column).toBe('Review');
    expect(card(step.board)).toMatchObject({ pullRequest: 12, branch: 'fix-login' });
    expect(card(step.board)?.comments?.map((each) => each.body)).toEqual([
      'Pull request #12 opened: Fix the login race https://github.com/o/r/pull/12',
    ]);
    const again = followStep(step.board!, 'card', 'fix-login', pull('OPEN'));
    expect(again).toEqual({ board: null, column: null });
  });

  it('leaves a card moved on from Review once it was said, except out of Done', () => {
    const fields = { pullRequest: 12, branch: 'fix-login', comments: [said('OPEN')] };
    expect(followStep(boardWith('Doing', fields), 'card', 'fix-login', pull('OPEN'))).toEqual({ board: null, column: null });
    expect(followStep(boardWith('Done', fields), 'card', 'fix-login', pull('OPEN')).column).toBe('Review');
  });

  it('moves a merged card into Done once, with the line', () => {
    const fields = { pullRequest: 12, branch: 'fix-login', comments: [said('OPEN')] };
    const step = followStep(boardWith('Review', fields), 'card', 'fix-login', pull('MERGED'));
    expect(step.column).toBe('Done');
    expect(card(step.board)?.comments?.at(-1)?.body).toMatch(/^Pull request #12 merged: /);
    const merged = { ...fields, comments: [said('OPEN'), said('MERGED')] };
    expect(followStep(boardWith('Doing', merged), 'card', 'fix-login', pull('MERGED'))).toEqual({ board: null, column: null });
    expect(followStep(boardWith('Done', fields), 'card', 'fix-login', pull('MERGED')).column).toBeNull();
  });

  it('sends a card back to Doing from Review or Done when its pull request closes unmerged, once', () => {
    const fields = { pullRequest: 12, branch: 'fix-login' };
    for (const column of ['Review', 'Done']) {
      const step = followStep(boardWith(column, fields), 'card', 'fix-login', pull('CLOSED'));
      expect(step.column).toBe('Doing');
      expect(card(step.board)?.comments?.at(-1)?.body).toMatch(/^Pull request #12 closed without merging: .*; back to Doing$/);
    }
    expect(followStep(boardWith('Todo', fields), 'card', 'fix-login', pull('CLOSED')).column).toBeNull();
    const closed = { ...fields, comments: [said('CLOSED')] };
    expect(followStep(boardWith('Done', closed), 'card', 'fix-login', pull('CLOSED'))).toEqual({ board: null, column: null });
  });

  it('follows a second pull request on the same branch', () => {
    const fields = { pullRequest: 12, branch: 'fix-login', comments: [said('CLOSED')] };
    const step = followStep(boardWith('Doing', fields), 'card', 'fix-login', pull('OPEN', 13));
    expect(step.column).toBe('Review');
    expect(card(step.board)?.pullRequest).toBe(13);
  });

  it('does nothing for a branch with no pull request, or a card gone from the board', () => {
    expect(followStep(boardWith('Doing'), 'card', 'fix-login', null)).toEqual({ board: null, column: null });
    expect(followStep(boardWith('Doing'), 'gone', 'fix-login', pull('OPEN'))).toEqual({ board: null, column: null });
  });
});
