import { describe, expect, it } from 'vitest';
import { fastForwardCheckout } from './fast-forward-checkout';
import type { ProgramAnswer } from './gh-answer';

const WORKTREES = [
  'worktree /work/api', 'HEAD 1111', 'branch refs/heads/main', '',
  'worktree /work/api.worktrees/fix', 'HEAD 2222', 'branch refs/heads/fix', '',
  'worktree /work/api.worktrees/old', 'HEAD 3333', 'detached',
].join('\n');

// A git that answers each command's first word from the table, and notes the folder it ran in.
function fakeGit(answers: Record<string, ProgramAnswer>) {
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
  // origin/<base>, not the branch's upstream: a main with none set is fast-forwarded too, as a ship does.
  it('merges origin/<base> --ff-only in the checkout on the base branch when it is clean, the project\'s own or a worktree', async () => {
    const git = fakeGit({ worktree: listed, status: { ok: true, output: '' }, fetch: { ok: true, output: '' }, merge: { ok: true, output: 'Fast-forward' } });
    expect(await fastForwardCheckout(git.git, '/work/api.worktrees/fix', 'origin', 'main')).toBe('fast-forwarded main in /work/api');
    expect(git.asked.slice(-2)).toEqual(['/work/api: fetch origin main', '/work/api: merge --ff-only origin/main']);
    expect(await fastForwardCheckout(git.git, '/work/api', 'origin', 'fix')).toBe('fast-forwarded fix in /work/api.worktrees/fix');
  });

  it('fetches and merges from the remote it is given when it is not origin', async () => {
    const git = fakeGit({ worktree: listed, status: { ok: true, output: '' }, fetch: { ok: true, output: '' }, merge: { ok: true, output: '' } });
    expect(await fastForwardCheckout(git.git, '/work/api', 'gitlab', 'main')).toBe('fast-forwarded main in /work/api');
    expect(git.asked.slice(-2)).toEqual(['/work/api: fetch gitlab main', '/work/api: merge --ff-only gitlab/main']);
  });

  // The board's own files change under the app all the time, and a pull never overwrites them unasked.
  it('fast-forwards over board changes, and leaves a checkout with other changes alone', async () => {
    const board = fakeGit({ worktree: listed, status: { ok: true, output: ' M .dashboard/board/a.json' }, fetch: { ok: true, output: '' }, merge: { ok: true, output: '' } });
    expect(await fastForwardCheckout(board.git, '/work/api', 'origin', 'main')).toBe('fast-forwarded main in /work/api');
    const dirty = fakeGit({ worktree: listed, status: { ok: true, output: ' M src/a.ts' } });
    expect(await fastForwardCheckout(dirty.git, '/work/api', 'origin', 'main')).toBe('main in /work/api has uncommitted changes, so it is not fast-forwarded');
    expect(dirty.asked.some((each) => each.includes('merge'))).toBe(false);
  });

  it('says so when no checkout is on the base branch, or the merge is refused', async () => {
    expect(await fastForwardCheckout(fakeGit({ worktree: listed }).git, '/work/api', 'origin', 'release')).toBe('no checkout is on release, so none is fast-forwarded');
    const diverged = fakeGit({ worktree: listed, status: { ok: true, output: '' }, fetch: { ok: true, output: '' }, merge: { ok: false, output: 'fatal: Not possible to fast-forward, aborting.' } });
    expect(await fastForwardCheckout(diverged.git, '/work/api', 'origin', 'main')).toBe('main in /work/api is not fast-forwarded: fatal: Not possible to fast-forward, aborting.');
  });

  it('says why when git cannot list the worktrees, read the status or fetch', async () => {
    const notRepository = fakeGit({ worktree: { ok: false, output: 'fatal: not a git repository' } });
    expect(await fastForwardCheckout(notRepository.git, '/work/api', 'origin', 'main')).toBe('main is not fast-forwarded: fatal: not a git repository');
    // The app's board sync holding the index lock in the same checkout.
    const locked = fakeGit({ worktree: listed, status: { ok: false, output: 'fatal: Unable to create index.lock' } });
    expect(await fastForwardCheckout(locked.git, '/work/api', 'origin', 'main')).toBe('main in /work/api is not fast-forwarded: fatal: Unable to create index.lock');
    const offline = fakeGit({ worktree: listed, status: { ok: true, output: '' }, fetch: { ok: false, output: 'fatal: unable to access' } });
    expect(await fastForwardCheckout(offline.git, '/work/api', 'origin', 'main')).toBe('main in /work/api is not fast-forwarded: fatal: unable to access');
    expect(offline.asked.some((each) => each.includes('merge'))).toBe(false);
  });
});
