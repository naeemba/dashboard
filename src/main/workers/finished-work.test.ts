import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProgram } from '../app/git';
import { temporaryFolder } from '../testing/temporary-folder';
import { pullRequestMerged, unfinishedWork } from './finished-work';
import { answeringPrograms as answering } from '../testing/answering-programs';

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
      'git rev-list --count HEAD --not a1b2c3': '0',
      'gh pr list': '[{"number":14,"state":"MERGED","title":"t","url":"https://github.com/o/r/pull/14","headRefOid":"a1b2c3"}]',
    };
    expect(await unfinishedWork(answering(merged), '/w')).toBeNull();
    expect(await unfinishedWork(answering({ ...merged, 'git rev-list --count HEAD --not a1b2c3': '1' }), '/w')).toBe('3 of its commits are on no remote');
  });
});

// The three worktrees that sat a week in dashboard.worktrees/ (2026-11-24), in a real repository whose
// origin/main has a card and a source file. The forge is never reached: only git answers.
describe('unfinishedWork, with the board a stale copy of origin\'s', () => {
  const gitOnly: typeof runProgram = (program, programArguments, cwd) =>
    program === 'git' ? runProgram(program, programArguments, cwd) : Promise.reject(new Error(`${program} failed`));

  function checkout(): { folder: string; run: (...gitArguments: string[]) => void } {
    const folder = temporaryFolder('finished-work-');
    const run = (...gitArguments: string[]) => {
      execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...gitArguments], { cwd: folder });
    };
    run('init', '--quiet', '--initial-branch', 'card');
    mkdirSync(join(folder, '.dashboard', 'board', 'cards'), { recursive: true });
    mkdirSync(join(folder, 'src'));
    writeFileSync(join(folder, CARD), '{"column":"Doing"}');
    writeFileSync(join(folder, 'src', 'a.ts'), 'one');
    run('add', '-A');
    run('commit', '--quiet', '-m', 'start');
    run('update-ref', 'refs/remotes/origin/main', 'HEAD');
    return { folder, run };
  }
  const CARD = '.dashboard/board/cards/a1.json';

  it('lets go of a worktree whose only change is its own card file', async () => {
    const { folder } = checkout();
    writeFileSync(join(folder, CARD), '{"column":"Review"}');
    writeFileSync(join(folder, '.dashboard', 'board', 'cards', 'b2.json'), '{}');
    expect(await unfinishedWork(gitOnly, folder)).toBeNull();
    writeFileSync(join(folder, 'src', 'a.ts'), 'two');
    expect(await unfinishedWork(gitOnly, folder)).toBe('it has uncommitted changes');
  });

  it('lets go of a worktree whose only unpushed commit touches only the board', async () => {
    const { folder, run } = checkout();
    writeFileSync(join(folder, CARD), '{"column":"Ship"}');
    run('commit', '--quiet', '-am', 'board: ship "a1"');
    expect(await unfinishedWork(gitOnly, folder)).toBeNull();
    writeFileSync(join(folder, 'src', 'a.ts'), 'two');
    run('commit', '--quiet', '-am', 'work');
    expect(await unfinishedWork(gitOnly, folder)).toBe('1 of its commits are on no remote');
  });

  it('lets go of a detached HEAD already on origin/main', async () => {
    const { folder, run } = checkout();
    run('checkout', '--quiet', '--detach', 'origin/main');
    expect(await unfinishedWork(gitOnly, folder)).toBeNull();
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
