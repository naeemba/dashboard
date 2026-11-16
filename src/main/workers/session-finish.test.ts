import { describe, expect, it } from 'vitest';
import { project } from './session-requests-fixture';

// `pane finish`: release, but only once the worker's work is in.
describe('session finish', () => {
  it('releases a worker whose card is Done', async () => {
    const api = project();
    await api.ask(['claim']);
    await api.ask(['run', '2:1', '--card', 'card-1', 'work it']);
    api.finishedCards.set('2:1', 'Done');
    expect(await api.ask(['finish', '2:1'])).toMatchObject({ ok: true, output: expect.stringContaining('released 2:1') });
    expect(api.closed).toEqual(['2:1']);
  });

  it('releases a worker in a worktree whose branch merged before its card moved', async () => {
    const asked: string[] = [];
    const api = project({
      directoryOf: () => '/work/api.worktrees/card-one',
      merged: async (worktreePath) => { asked.push(worktreePath); return true; },
    });
    await api.ask(['claim']);
    await api.ask(['run', '2:1', '--card', 'card-1', 'work it']);
    expect(await api.ask(['finish', '2:1'])).toMatchObject({ ok: true });
    expect(asked).toEqual(['/work/api.worktrees/card-one']);
  });

  // gh pr merge --delete-branch removes the worktree, and git spawned into it fails.
  it('releases a worker whose worktree is already gone without asking git', async () => {
    const api = project({
      directoryOf: () => '/work/api.worktrees/card-one',
      exists: () => false,
      merged: async () => { throw new Error('spawn git ENOENT'); },
    });
    await api.ask(['claim']);
    await api.ask(['run', '2:1', '--card', 'card-1', 'work it']);
    expect(await api.ask(['finish', '2:1'])).toMatchObject({ ok: true, output: expect.stringContaining('released 2:1') });
    expect(api.closed).toEqual(['2:1']);
  });

  it('refuses a worker whose work is not in, and leaves its pane open', async () => {
    const inWorktree = project({ directoryOf: () => '/work/api.worktrees/card-one' });
    await inWorktree.ask(['claim']);
    await inWorktree.ask(['run', '2:1', '--card', 'card-1', 'work it']);
    expect(await inWorktree.ask(['finish', '2:1'])).toEqual({
      ok: false, output: '2:1\'s work is not in: no card of its is Done or Cancelled and /work/api.worktrees/card-one\'s branch has no merged pull request',
    });
    expect(inWorktree.closed).toEqual([]);
  });

  // The checkout is on the project's main branch, whose merged pull requests are anybody's.
  it('never asks about the branch of the project\'s own checkout', async () => {
    const api = project({ merged: async () => true });
    await api.ask(['claim']);
    await api.ask(['run', '2:1', 'research it']);
    expect(await api.ask(['finish', '2:1'])).toEqual({ ok: false, output: '2:1\'s work is not in: no card of its is Done or Cancelled' });
  });

  it('refuses main as release does', async () => {
    expect(await project().ask(['finish', '2:0'])).toMatchObject({ ok: false, output: expect.stringContaining('main session') });
  });
});
