import { describe, expect, it } from 'vitest';
import { pullRequestMerged, unfinishedWork, type RunProgram } from './finished-work';

// A worktree whose every answer is given up front; a missing answer is the program failing.
function answering(answers: Record<string, string>): RunProgram {
  return async (program, programArguments) => {
    const key = `${program} ${programArguments.join(' ')}`;
    const answer = Object.entries(answers).find(([start]) => key.startsWith(start))?.[1];
    if (answer === undefined) throw new Error(`${program} failed`);
    return answer;
  };
}

const done = {
  'git status': '',
  'git rev-list --count HEAD --not --remotes': '0',
};

describe('unfinishedWork', () => {
  // A research worker that changed nothing, its branch never pushed: nothing in it would be lost.
  it('lets the folder go when it has no changes and every commit is on a remote', async () => {
    expect(await unfinishedWork(answering(done), '/work/api.worktrees/rename-it')).toBeNull();
  });

  it('keeps a folder with changes nobody committed', async () => {
    expect(await unfinishedWork(answering({ ...done, 'git status': ' M src/a.ts' }), '/w')).toBe('it has uncommitted changes');
  });

  it('keeps commits no remote has', async () => {
    expect(await unfinishedWork(answering({ ...done, 'git rev-list --count HEAD --not --remotes': '2' }), '/w')).toBe('2 of its commits are on no remote');
  });

  // Squash-merged with --delete-branch and the remote branch pruned: its commits are on no remote, yet
  // the merge took them.
  it('lets the folder go when its pull request merged at HEAD and the branch is gone', async () => {
    const merged = {
      ...done,
      'git rev-list --count HEAD --not --remotes': '3',
      'git rev-parse --abbrev-ref HEAD': 'rename-it',
      'git rev-parse HEAD': 'a1b2c3\n',
      'gh pr list': '[{"number":14,"state":"MERGED","title":"t","url":"https://github.com/o/r/pull/14","headRefOid":"a1b2c3"}]',
    };
    expect(await unfinishedWork(answering(merged), '/w')).toBeNull();
    expect(await unfinishedWork(answering({ ...merged, 'git rev-parse HEAD': 'ffffff' }), '/w')).toBe('3 of its commits are on no remote');
  });
});

describe('pullRequestMerged', () => {
  const pull = (number: number, state: string) => ({ number, state, title: 't', url: `https://github.com/o/r/pull/${number}` });
  const listing = (...pulls: object[]) => answering({ 'git rev-parse': 'fix-login', 'gh pr list --head fix-login': JSON.stringify(pulls) });

  it('says merged once the branch\'s pull request merged', async () => {
    expect(await pullRequestMerged(listing(pull(40, 'MERGED')), '/w')).toBe(true);
  });

  // #40 merged, then a follow-up on the same branch opened #41: the work is not in yet.
  it('is not merged while a newer pull request from the branch is open', async () => {
    expect(await pullRequestMerged(listing(pull(41, 'OPEN'), pull(40, 'MERGED')), '/w')).toBe(false);
    expect(await pullRequestMerged(listing(), '/w')).toBe(false);
  });
});
