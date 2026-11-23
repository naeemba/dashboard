import { describe, expect, it } from 'vitest';
import type { WorktreeRemoval } from '../../../shared/app/bridge';
import { worktreeActions } from './worktree-actions';

// How each door takes a refusal. Every input here is one the actions refuse before touching git.
function actions(removal: WorktreeRemoval = { ok: true, message: '', dirty: [] }) {
  return worktreeActions({
    remove: async () => removal,
    queue: async (_projectPath, run) => run(),
    log: () => {},
  });
}

describe('worktreeActions', () => {
  it('throws a refused make rather than answering a worktree that was never made', async () => {
    await expect(actions().makeAgain({
      cardId: 'c', title: 'Fix', projectPath: '/code/api', branch: '', worktreePath: '/w/fix',
      pane: null, startedAt: '2026-09-01T00:00:00Z', reviewing: false,
    })).rejects.toThrow('the worktree to make was not one the app could read');
  });

  it('answers a refused review removal as a plain failure with no files', async () => {
    expect(await actions().removeForReview('')).toEqual({
      ok: false, message: 'the worktree to remove was not one the app could read', dirty: [],
    });
  });

  it('throws a failed release removal, naming the folder when git said nothing', async () => {
    await expect(actions({ ok: false, message: '', dirty: ['a.ts'] }).removeForRelease('/w/fix', '/code/api'))
      .rejects.toThrow('/w/fix has changes');
  });
});
