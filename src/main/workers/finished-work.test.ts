import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProgram } from '../app/git';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';
import { pullRequestMerged, unfinishedWork } from './finished-work';
import { answeringPrograms as answering } from '../testing/answering-programs';

const done = {
  'git status': '',
  'git rev-list --count HEAD --not --remotes': '0',
  'git log': '',
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

// The three worktrees that sat a week in dashboard.worktrees/ (2026-11-24), in a real repository
// whose origin (a bare repository) has a card and a source file. The forge is never reached: only git
// answers. `synced` writes the card on origin's main the way the board's sync does, from another clone.
describe('unfinishedWork, with the board a stale copy of origin\'s', () => {
  useGitTestEnvironment();
  const gitOnly: typeof runProgram = (program, programArguments, cwd, options) =>
    program === 'git' ? runProgram(program, programArguments, cwd, options) : Promise.reject(new Error(`${program} failed`));

  const CARD = '.dashboard/board/cards/a1.json';

  function checkout() {
    const origin = temporaryFolder('finished-work-origin-');
    git(origin, 'init', '--quiet', '--bare', '--initial-branch', 'main');
    const clone = (name: string) => {
      const folder = join(temporaryFolder(name), 'work');
      git(dirname(folder), 'clone', '--quiet', origin, folder);
      return folder;
    };
    const seed = clone('finished-work-seed-');
    mkdirSync(join(seed, '.dashboard', 'board', 'cards'), { recursive: true });
    mkdirSync(join(seed, 'src'));
    writeFileSync(join(seed, CARD), '{"column":"Doing"}');
    writeFileSync(join(seed, 'src', 'a.ts'), 'one');
    git(seed, 'add', '-A');
    git(seed, 'commit', '--quiet', '-m', 'start');
    git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
    const folder = clone('finished-work-');
    const run = (...gitArguments: string[]) => { git(folder, ...gitArguments); };
    run('checkout', '--quiet', '-b', 'card');
    const synced = (column: string) => {
      git(seed, 'pull', '--quiet', 'origin', 'main');
      writeFileSync(join(seed, CARD), `{"column":"${column}"}`);
      git(seed, 'commit', '--quiet', '-am', `board: ${column}`);
      git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
    };
    return { folder, run, synced, origin };
  }

  // Its Review reached origin, and origin has moved the card on to Done since.
  it('lets go of a worktree whose only change is its own card file, once origin has held it', async () => {
    const { folder, synced } = checkout();
    synced('Review');
    synced('Done');
    writeFileSync(join(folder, CARD), '{"column":"Review"}');
    expect(await unfinishedWork(gitOnly, folder)).toBeNull();
    writeFileSync(join(folder, 'src', 'a.ts'), 'two');
    expect(await unfinishedWork(gitOnly, folder)).toBe('it has uncommitted changes');
  });

  it('keeps a worktree whose board edit never reached origin, and says which file', async () => {
    const { folder } = checkout();
    writeFileSync(join(folder, CARD), '{"column":"Review"}');
    writeFileSync(join(folder, '.dashboard', 'board', 'cards', 'b2.json'), '{}');
    expect(await unfinishedWork(gitOnly, folder))
      .toBe(`its board edits of ${CARD}, .dashboard/board/cards/b2.json never reached origin/main`);
  });

  it('keeps a worktree that deleted a card origin still has', async () => {
    const { folder } = checkout();
    rmSync(join(folder, CARD));
    expect(await unfinishedWork(gitOnly, folder)).toBe(`its board edits of ${CARD} never reached origin/main`);
  });

  it('keeps a worktree whose board-only commit never reached origin', async () => {
    const { folder, run } = checkout();
    writeFileSync(join(folder, CARD), '{"column":"Ship"}');
    run('commit', '--quiet', '-am', 'board: ship "a1"');
    expect(await unfinishedWork(gitOnly, folder)).toBe(`its board edits of ${CARD} never reached origin/main`);
  });

  it('keeps a board-only worktree when origin cannot be fetched', async () => {
    const { folder, run, origin } = checkout();
    run('remote', 'set-url', 'origin', join(origin, 'gone'));
    writeFileSync(join(folder, CARD), '{"column":"Review"}');
    expect(await unfinishedWork(gitOnly, folder)).toBe('its board edits could not be checked: fetching origin/main failed');
  });

  it('lets go of a worktree whose only unpushed commit touches only the board, once origin holds it', async () => {
    const { folder, run, synced } = checkout();
    synced('Ship');
    writeFileSync(join(folder, CARD), '{"column":"Ship"}');
    run('commit', '--quiet', '-am', 'board: ship "a1"');
    expect(await unfinishedWork(gitOnly, folder)).toBeNull();
    writeFileSync(join(folder, 'src', 'a.ts'), 'two');
    run('commit', '--quiet', '-am', 'work');
    expect(await unfinishedWork(gitOnly, folder)).toBe('1 of its commits are on no remote');
  });

  it('keeps an untracked file even where status hides untracked files', async () => {
    const { folder, run } = checkout();
    run('config', 'status.showUntrackedFiles', 'no');
    writeFileSync(join(folder, CARD), '{"column":"Review"}');
    writeFileSync(join(folder, 'scratch.md'), 'plan');
    expect(await unfinishedWork(gitOnly, folder)).toBe('it has uncommitted changes');
  });

  it('lets go of a detached HEAD whose only commit past origin/main is a board write origin holds', async () => {
    const { folder, run, synced } = checkout();
    synced('Ship');
    run('checkout', '--quiet', '--detach');
    writeFileSync(join(folder, CARD), '{"column":"Ship"}');
    run('commit', '--quiet', '-am', 'board: ship "a1"');
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
