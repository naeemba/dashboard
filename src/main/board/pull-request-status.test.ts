import { describe, expect, it } from 'vitest';
import { columnNamed, emptyBoard, type Board, type Card } from '../../shared/board/board';
import { flightLine } from '../../shared/board/pull-request-status';
import { pullRequestComment, type PullRequest } from './pull-request-column';
import { pullRequestStatus, pullRequestStatuses } from './pull-request-status';

function pull(fields: Record<string, unknown> = {}, state: PullRequest['state'] = 'OPEN'): PullRequest {
  return { number: 12, state, title: 'Fix login', url: 'https://github.com/o/r/pull/12', ...fields } as PullRequest;
}

const passed = { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' };
const running = { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null };
const failed = { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' };

describe('pullRequestStatus', () => {
  it('says merged, then a failed check, a running one, the approval, whether it can merge', () => {
    expect(pullRequestStatus(pull({ statusCheckRollup: [failed] }, 'MERGED'))).toBe('merged');
    expect(pullRequestStatus(pull({ mergeable: 'MERGEABLE' }, 'CLOSED'))).toBeNull();
    expect(pullRequestStatus(pull({ statusCheckRollup: [running, failed], reviewDecision: 'APPROVED' }))).toBe('failed');
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed, running], reviewDecision: 'APPROVED' }))).toBe('running');
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed], reviewDecision: 'APPROVED', mergeable: 'MERGEABLE' }))).toBe('approved');
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed], reviewDecision: '', mergeable: 'MERGEABLE' }))).toBe('mergeable');
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed], mergeable: 'CONFLICTING' }))).toBeNull();
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed], reviewDecision: 'REVIEW_REQUIRED', mergeable: 'MERGEABLE' }))).toBeNull();
    expect(pullRequestStatus(pull({ statusCheckRollup: [passed], reviewDecision: 'CHANGES_REQUESTED', mergeable: 'MERGEABLE' }))).toBeNull();
  });

  // A commit status, from an outside service, has a state and no status.
  it('reads a commit status by its state', () => {
    expect(pullRequestStatus(pull({ statusCheckRollup: [{ __typename: 'StatusContext', state: 'PENDING' }] }))).toBe('running');
    expect(pullRequestStatus(pull({ statusCheckRollup: [{ __typename: 'StatusContext', state: 'ERROR' }] }))).toBe('failed');
    expect(pullRequestStatus(pull({ statusCheckRollup: [{ __typename: 'StatusContext', state: 'SUCCESS' }], mergeable: 'MERGEABLE' }))).toBe('mergeable');
  });
});

function boardOf(...cards: Partial<Card>[]): Board {
  const board = emptyBoard();
  board.columns[columnNamed(board, 'Review')].cards.push(...cards.map((fields, index) =>
    ({ id: `card-${index}`, title: 'Fix login', notes: '', priority: 'medium', parent: null, ...fields } as Card)));
  return board;
}

describe('pullRequestStatuses', () => {
  it('tells a change apart from the same answer again', () => {
    const statuses = pullRequestStatuses();
    expect(statuses.record('/p', 'fix-login', 'running')).toBe(true);
    expect(statuses.record('/p', 'fix-login', 'running')).toBe(false);
    expect(statuses.record('/p', 'fix-login', 'failed')).toBe(true);
    expect(statuses.record('/p', 'other', null)).toBe(false);
  });

  // The merged card is never asked about again, so after a restart only its trail says merged.
  it('gives each card its branch\'s glyph, and merged from the trail without asking', () => {
    const statuses = pullRequestStatuses();
    statuses.record('/p', 'fix-login', 'approved');
    statuses.record('/q', 'other', 'failed');
    const board = boardOf(
      { branch: 'fix-login', pullRequest: 12 },
      { branch: 'other', pullRequest: 13 },
      { branch: 'done', pullRequest: 12, comments: [{ body: pullRequestComment(pull({}, 'MERGED')) }] },
      {},
    );
    expect(statuses.of('/p', board)).toEqual({ 'card-0': 'approved', 'card-2': 'merged' });
  });
});

describe('flightLine', () => {
  it('puts the glyph after the branch and the number', () => {
    const [card] = boardOf({ branch: 'fix-login', pullRequest: 12 }).columns[columnNamed(emptyBoard(), 'Review')].cards;
    expect(flightLine(card, 'approved')).toBe('fix-login · #12 · ✓');
    expect(flightLine(card, undefined)).toBe('fix-login · #12');
  });
});
