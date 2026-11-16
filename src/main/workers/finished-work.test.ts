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

// The same answers with one program failing.
function without(answers: Record<string, string>, failing: string): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([start]) => start !== failing));
}

const done = {
  'git status': '',
  'git rev-list': '0',
  'git rev-parse': 'rename-it',
  'gh pr list': '[{"number":14}]',
};

describe('unfinishedWork', () => {
  it('lets the folder go once the work is committed, pushed and has a pull request', async () => {
    expect(await unfinishedWork(answering(done), '/work/api.worktrees/rename-it')).toBeNull();
  });

  it('keeps a folder with changes nobody committed', async () => {
    expect(await unfinishedWork(answering({ ...done, 'git status': ' M src/a.ts' }), '/w')).toBe('it has uncommitted changes');
  });

  it('keeps a branch that was never pushed, or has commits that were not', async () => {
    expect(await unfinishedWork(answering(without(done, 'git rev-list')), '/w')).toBe('its branch was never pushed');
    expect(await unfinishedWork(answering({ ...done, 'git rev-list': '2' }), '/w')).toBe('2 of its commits are not pushed');
  });

  it('keeps pushed work with no pull request, and says so when gh cannot be asked', async () => {
    expect(await unfinishedWork(answering({ ...done, 'gh pr list': '[]' }), '/w')).toBe('rename-it has no pull request');
    expect(await unfinishedWork(answering(without(done, 'gh pr list')), '/w')).toMatch(/^gh could not say whether rename-it has a pull request/);
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
