import { describe, expect, it } from 'vitest';
import { unfinishedWork, type RunProgram } from './finished-work';

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
