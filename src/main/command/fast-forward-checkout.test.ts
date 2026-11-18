import { describe, expect, it } from 'vitest';
import { fastForwardCheckout } from './fast-forward-checkout';
import type { GitHubAnswer } from './pull-request-cli';

const WORKTREES = [
  'worktree /work/api', 'HEAD 1111', 'branch refs/heads/main', '',
  'worktree /work/api.worktrees/fix', 'HEAD 2222', 'branch refs/heads/fix', '',
  'worktree /work/api.worktrees/old', 'HEAD 3333', 'detached',
].join('\n');

// A git that answers each command's first word from the table, and notes the folder it ran in.
function fakeGit(answers: Record<string, GitHubAnswer>) {
  const asked: string[] = [];
  return {
    asked,
    git: async (folder: string, words: string[]) => {
      asked.push(`${folder}: ${words.join(' ')}`);
      return answers[words[0]];
    },
  };
}

const listed = { ok: true, output: WORKTREES };

describe('fastForwardCheckout', () => {
  it('pulls --ff-only in the checkout on the base branch when it is clean, the project\'s own or a worktree', async () => {
    const git = fakeGit({ worktree: listed, status: { ok: true, output: '' }, pull: { ok: true, output: 'Fast-forward' } });
    expect(await fastForwardCheckout(git.git, '/work/api.worktrees/fix', 'main')).toBe('fast-forwarded main in /work/api');
    expect(git.asked.at(-1)).toBe('/work/api: pull --ff-only');
    expect(await fastForwardCheckout(git.git, '/work/api', 'fix')).toBe('fast-forwarded fix in /work/api.worktrees/fix');
  });

  // The board's own files change under the app all the time, and a pull never overwrites them unasked.
  it('fast-forwards over board changes, and leaves a checkout with other changes alone', async () => {
    const board = fakeGit({ worktree: listed, status: { ok: true, output: ' M .dashboard/board/a.json' }, pull: { ok: true, output: '' } });
    expect(await fastForwardCheckout(board.git, '/work/api', 'main')).toBe('fast-forwarded main in /work/api');
    const dirty = fakeGit({ worktree: listed, status: { ok: true, output: ' M src/a.ts' } });
    expect(await fastForwardCheckout(dirty.git, '/work/api', 'main')).toBe('main in /work/api has uncommitted changes, so it is not fast-forwarded');
    expect(dirty.asked.some((each) => each.includes('pull'))).toBe(false);
  });

  it('says so when no checkout is on the base branch, or the pull is refused', async () => {
    expect(await fastForwardCheckout(fakeGit({ worktree: listed }).git, '/work/api', 'release')).toBe('no checkout is on release, so none is fast-forwarded');
    const diverged = fakeGit({ worktree: listed, status: { ok: true, output: '' }, pull: { ok: false, output: 'fatal: Not possible to fast-forward, aborting.' } });
    expect(await fastForwardCheckout(diverged.git, '/work/api', 'main')).toBe('main in /work/api is not fast-forwarded: fatal: Not possible to fast-forward, aborting.');
  });
});
