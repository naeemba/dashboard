import { describe, expect, it } from 'vitest';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { emptyBoard, type Board } from '../../shared/board/board';
import { finishedCardIn, finishedColumnOf, releaseVerdict, type WorkerLook } from './auto-release';

const TEN_MINUTES = 10 * 60 * 1000;

// A worker main handed work, whose turn ended with nothing running, its report read ten minutes ago.
// `card` is the column its card is in when finished, `merged` whether its worktree's branch merged.
type Look = Omit<WorkerLook, 'finishedCard' | 'branchMerged'> & { card: string | null; merged: boolean };
const finished: Look = {
  handedToMain: true, hasKeyboard: false, state: 'done', paused: false, card: null, merged: false, reportRead: true, quietMs: TEN_MINUTES,
};
const verdict = (change: Partial<Look>, closeAfterMs = TEN_MINUTES) => {
  const { card, merged, ...look } = { ...finished, ...change };
  return releaseVerdict({ ...look, finishedCard: () => card, branchMerged: async () => merged }, closeAfterMs);
};

describe('releaseVerdict', () => {
  it('closes a worker that reported, was read, and was sent nothing for the grace period', async () => {
    expect(await verdict({})).toEqual({ release: true, reason: 'reported done' });
  });

  it('waits out the grace period after the report', async () => {
    expect(await verdict({ quietMs: TEN_MINUTES - 1 })).toEqual({ release: false, why: 'its grace period is still running' });
  });

  it('keeps a worker whose report main has not read', async () => {
    expect(await verdict({ reportRead: false })).toMatchObject({ release: false, why: 'main has not read a report from it' });
  });

  it('closes a worker whose card is done or cancelled once its turn ends, report or not', async () => {
    expect(await verdict({ card: 'Done', reportRead: false, quietMs: 0 })).toEqual({ release: true, reason: 'card done' });
    expect(await verdict({ card: 'Cancelled', reportRead: false, quietMs: 0 })).toEqual({ release: true, reason: 'card cancelled' });
  });

  it('closes a worker whose worktree\'s branch merged once its turn ends, report or not', async () => {
    expect(await verdict({ merged: true, reportRead: false, quietMs: 0 })).toEqual({ release: true, reason: 'pull request merged' });
  });

  it('with the grace period off, closes only for the card or a merged branch', async () => {
    expect(await verdict({}, 0)).toEqual({ release: false, why: 'closing on a report is off' });
    expect(await verdict({ card: 'Done' }, 0)).toEqual({ release: true, reason: 'card done' });
    expect(await verdict({ merged: true }, 0)).toEqual({ release: true, reason: 'pull request merged' });
  });

  it('never closes a pane no main handed work, even with its card done', async () => {
    expect(await verdict({ handedToMain: false, card: 'Done' })).toEqual({ release: false, why: 'no main handed it work' });
  });

  it('never closes the pane with the keyboard', async () => {
    expect(await verdict({ hasKeyboard: true, card: 'Done' })).toEqual({ release: false, why: 'it has the keyboard' });
  });

  it('never closes a worker blocked on a question or paused on its own background work', async () => {
    expect(await verdict({ state: 'blocked', card: 'Done' })).toEqual({ release: false, why: 'it is waiting on a question' });
    expect(await verdict({ paused: true, card: 'Done' })).toEqual({ release: false, why: 'it is waiting on its own background work' });
  });

  it('reads the card and asks about the branch only once nothing else has kept the pane', async () => {
    let asked = 0;
    const count = { finishedCard: () => { asked += 1; return null; }, branchMerged: async () => { asked += 1; return false; } };
    await releaseVerdict({ ...finished, state: 'running', ...count }, TEN_MINUTES);
    expect(asked).toBe(0);
  });

  it('asks about the branch only when the card has not closed the pane', async () => {
    let asked = 0;
    await releaseVerdict({ ...finished, finishedCard: () => 'Done', branchMerged: async () => { asked += 1; return true; } }, TEN_MINUTES);
    expect(asked).toBe(0);
  });

  it('never closes a worker still at work, even with its card done', async () => {
    expect(await verdict({ state: 'running', card: 'Done' })).toEqual({ release: false, why: 'it is at work' });
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
