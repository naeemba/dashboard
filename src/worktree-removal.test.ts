import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardBridge, WorktreeRemoval } from './bridge';
import type { WorktreeEntry } from './worktree-store';

// The sheets are the overlay's; here each question is answered from a list, in the order asked.
const answers: boolean[] = [];
const asked: string[] = [];
vi.mock('./overlay', () => ({
  confirmOverlay: vi.fn(async (question: string) => {
    asked.push(question);
    return answers.shift() ?? false;
  }),
}));

const { removeWorktreeAsking } = await import('./worktree-removal');

const entry: WorktreeEntry = {
  cardId: 'c', title: 'Fix login', projectPath: '/work/api', branch: 'fix-login',
  worktreePath: '/work/api.worktrees/fix-login', pane: 1, startedAt: '2026-09-01T00:00:00Z', reviewing: false,
};

function bridge(...results: WorktreeRemoval[]) {
  const removeWorktree = vi.fn(async () => results.shift() ?? { ok: true, message: '', dirty: [] });
  return { bridge: { removeWorktree } as unknown as DashboardBridge, removeWorktree };
}

beforeEach(() => {
  answers.length = 0;
  asked.length = 0;
});

describe('removeWorktreeAsking', () => {
  it('removes nothing when the first question is turned down', async () => {
    const { bridge: port, removeWorktree } = bridge();
    answers.push(false);
    await removeWorktreeAsking(port, entry, () => {});
    expect(removeWorktree).not.toHaveBeenCalled();
  });

  it('removes a clean worktree after one question, without forcing', async () => {
    const { bridge: port, removeWorktree } = bridge();
    answers.push(true);
    await removeWorktreeAsking(port, entry, () => {});
    expect(removeWorktree.mock.calls).toEqual([[entry.worktreePath, false]]);
    expect(asked).toHaveLength(1);
  });

  it('names the uncommitted files, and forces only when asked a second time', async () => {
    const { bridge: port, removeWorktree } = bridge(
      { ok: false, message: 'dirty', dirty: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] },
    );
    answers.push(true, true);
    await removeWorktreeAsking(port, entry, () => {});
    expect(asked[1]).toBe('fix-login has uncommitted changes: a.ts, b.ts, c.ts and 1 more.');
    expect(removeWorktree.mock.calls).toEqual([[entry.worktreePath, false], [entry.worktreePath, true]]);
  });

  // git refuses files the dirty check exempts. Without the offer that worktree could never be removed.
  it('offers the forced removal whatever the first attempt failed on', async () => {
    const { bridge: port } = bridge({ ok: false, message: 'use --force to delete it', dirty: [] });
    answers.push(true, false);
    await removeWorktreeAsking(port, entry, () => {});
    expect(asked[1]).toBe('fix-login was not removed: use --force to delete it');
  });

  it('hands the keyboard back after every sheet', async () => {
    const { bridge: port } = bridge({ ok: false, message: 'no', dirty: [] }, { ok: false, message: 'still no', dirty: [] });
    const refocus = vi.fn();
    answers.push(true, true);
    await removeWorktreeAsking(port, entry, refocus);
    expect(asked).toEqual([expect.any(String), expect.any(String), 'still no']);
    expect(refocus).toHaveBeenCalledTimes(3);
  });
});
