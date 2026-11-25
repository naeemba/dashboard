import { describe, expect, it } from 'vitest';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { emptyBoard, type Board } from '../../shared/board/board';
import { finishedCardIn, finishedColumnOf, releaseVerdict, type WorkerLook } from './auto-release';

// A worker main handed work, whose turn ended with nothing running, the last prompt in it main's.
const finished: WorkerLook = { handedToMain: true, hasKeyboard: false, state: 'done', typedByUser: false };
const verdict = (change: Partial<WorkerLook>) => releaseVerdict({ ...finished, ...change });

describe('releaseVerdict', () => {
  it('closes a worker whose turn ended', () => {
    expect(verdict({})).toEqual({ release: true });
  });

  it('never closes a pane no main handed work', () => {
    expect(verdict({ handedToMain: false })).toEqual({ release: false, why: 'no main handed it work' });
  });

  it('never closes the pane with the keyboard', () => {
    expect(verdict({ hasKeyboard: true })).toEqual({ release: false, why: 'it has the keyboard' });
  });

  it('never closes a worker blocked on a question', () => {
    expect(verdict({ state: 'blocked' })).toEqual({ release: false, why: 'it is waiting on a question' });
  });

  it('never closes a worker you typed into since main last sent it work, even with its turn over', () => {
    expect(verdict({ typedByUser: true })).toEqual({ release: false, why: 'you typed into it since main last sent it work' });
  });

  it('never closes a worker mid-turn', () => {
    expect(verdict({ state: 'running' })).toEqual({ release: false, why: 'it is mid-turn' });
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
