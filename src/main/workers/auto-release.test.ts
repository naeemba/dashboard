import { describe, expect, it } from 'vitest';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { emptyBoard, type Board } from '../../shared/board/board';
import { finishedCardIn, finishedColumnOf, releaseVerdict, type WorkerLook } from './auto-release';

const TEN_MINUTES = 10 * 60 * 1000;

// A worker main handed work, whose turn ended with nothing running, its report read ten minutes ago.
const finished: WorkerLook = {
  handedToMain: true, hasKeyboard: false, state: 'done', paused: false, finishedCard: null, reportRead: true, quietMs: TEN_MINUTES,
};
const verdict = (change: Partial<WorkerLook>, closeAfterMs = TEN_MINUTES) => releaseVerdict({ ...finished, ...change }, closeAfterMs);

describe('releaseVerdict', () => {
  it('closes a worker that reported, was read, and was sent nothing for the grace period', () => {
    expect(verdict({})).toEqual({ release: true, reason: 'reported done' });
  });

  it('waits out the grace period after the report', () => {
    expect(verdict({ quietMs: TEN_MINUTES - 1 })).toEqual({ release: false, why: 'its grace period is still running' });
  });

  it('keeps a worker whose report main has not read', () => {
    expect(verdict({ reportRead: false })).toMatchObject({ release: false, why: 'main has not read a report from it' });
  });

  it('closes a worker whose card is done or cancelled once its turn ends, report or not', () => {
    expect(verdict({ finishedCard: 'Done', reportRead: false, quietMs: 0 })).toEqual({ release: true, reason: 'card done' });
    expect(verdict({ finishedCard: 'Cancelled', reportRead: false, quietMs: 0 })).toEqual({ release: true, reason: 'card cancelled' });
  });

  it('with the grace period off, closes only for the card', () => {
    expect(verdict({}, 0)).toEqual({ release: false, why: 'closing on a report is off' });
    expect(verdict({ finishedCard: 'Done' }, 0)).toEqual({ release: true, reason: 'card done' });
  });

  it('never closes a pane no main handed work, even with its card done', () => {
    expect(verdict({ handedToMain: false, finishedCard: 'Done' })).toEqual({ release: false, why: 'no main handed it work' });
  });

  it('never closes the pane with the keyboard', () => {
    expect(verdict({ hasKeyboard: true, finishedCard: 'Done' })).toEqual({ release: false, why: 'it has the keyboard' });
  });

  it('never closes a worker blocked on a question or paused on its own background work', () => {
    expect(verdict({ state: 'blocked', finishedCard: 'Done' })).toEqual({ release: false, why: 'it is waiting on a question' });
    expect(verdict({ paused: true, finishedCard: 'Done' })).toEqual({ release: false, why: 'it is waiting on its own background work' });
  });

  it('never closes a worker still at work, even with its card done', () => {
    expect(verdict({ state: 'running', finishedCard: 'Done' })).toEqual({ release: false, why: 'it is at work' });
  });
});

// A board with card-1 in the column.
const board = (column: string): Board => ({
  columns: emptyBoard().columns.map((each) => (each.name === column
    ? { ...each, cards: [{ id: 'card-1', title: 'Fix it', notes: '', priority: 'medium', parent: null }] } : each)),
});

describe('finishedColumnOf', () => {
  it('names Done and Cancelled, and nothing else', () => {
    expect(finishedColumnOf(board('Done'), 'card-1')).toBe('Done');
    expect(finishedColumnOf(board('Cancelled'), 'card-1')).toBe('Cancelled');
    expect(finishedColumnOf(board('Review'), 'card-1')).toBeNull();
  });

  it('is null for a card not on the board, or no board', () => {
    expect(finishedColumnOf(board('Done'), 'card-2')).toBeNull();
    expect(finishedColumnOf(null, 'card-1')).toBeNull();
  });
});

describe('finishedCardIn', () => {
  const entry: WorktreeEntry = {
    cardId: 'card-1', title: 'Fix it', projectPath: '/work/api', branch: 'fix-it', worktreePath: '/work/api.worktrees/fix-it',
    pane: 2, startedAt: '2026-11-09T10:00:00Z', reviewing: false,
  };
  const boards = (projectPath: string) => (projectPath === '/work/api' ? board('Done') : null);

  it('reads the card of the worktree in that pane of that project', () => {
    expect(finishedCardIn([entry], '/work/api', 2, boards)).toBe('Done');
  });

  it('is null for another pane, another project, or a pane with no card', () => {
    expect(finishedCardIn([entry], '/work/api', 3, boards)).toBeNull();
    expect(finishedCardIn([{ ...entry, projectPath: '/work/web' }], '/work/api', 2, boards)).toBeNull();
    expect(finishedCardIn([], '/work/api', 2, boards)).toBeNull();
  });
});
