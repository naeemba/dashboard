import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carriedFiles, moveAll, moveBack, setAsideUntracked } from './untracked-carry';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';

describe('carriedFiles', () => {
  it('carries untracked files and folders', () => {
    expect(carriedFiles('?? AGENTS.md\0?? notes/\0')).toEqual(['AGENTS.md', 'notes/']);
  });

  it('carries nothing while a tracked file is changed too', () => {
    expect(carriedFiles(' M src/a.ts\0?? AGENTS.md\0')).toEqual([]);
  });

  it('leaves the board to the removal, untracked, changed or renamed', () => {
    expect(carriedFiles('?? .dashboard/board/cards/a.json\0?? AGENTS.md\0')).toEqual(['AGENTS.md']);
    expect(carriedFiles(' M .dashboard/board/cards/a.json\0?? AGENTS.md\0')).toEqual(['AGENTS.md']);
    expect(carriedFiles('R  .dashboard/board/cards/b.json\0.dashboard/board/cards/a.json\0?? AGENTS.md\0')).toEqual(['AGENTS.md']);
  });
});

describe('setAsideUntracked', () => {
  useGitTestEnvironment();

  function cleanWorktree(): string {
    const worktree = join(temporaryFolder('dashboard-carry-'), 'card');
    mkdirSync(worktree);
    git(worktree, 'init', '--quiet', '--initial-branch', 'main');
    writeFileSync(join(worktree, 'tracked.ts'), 'x');
    git(worktree, 'add', '-A');
    git(worktree, 'commit', '--quiet', '-m', 'start');
    return worktree;
  }

  it('moves nothing out of a clean worktree', async () => {
    const worktree = cleanWorktree();
    const carried = await setAsideUntracked(worktree);
    expect(carried.files).toEqual([]);
    await carried.restore();
    expect(readdirSync(dirname(worktree))).toEqual(['card']);
  });

  it('moves nothing for a worktree folder already gone', async () => {
    const carried = await setAsideUntracked(join(temporaryFolder('dashboard-carry-'), 'gone'));
    expect(carried.files).toEqual([]);
  });

  it('carries a non-ASCII name as written', async () => {
    const worktree = cleanWorktree();
    writeFileSync(join(worktree, 'AGENTS.md'), 'rules');
    writeFileSync(join(worktree, 'café.md'), 'menu');

    const carried = await setAsideUntracked(worktree);
    expect(carried.files).toEqual(['AGENTS.md', 'café.md']);
    expect(git(worktree, 'status', '--porcelain')).toBe('');

    await carried.restore();
    expect(readFileSync(join(worktree, 'café.md'), 'utf8')).toBe('menu');
    expect(readdirSync(dirname(worktree))).toEqual(['card']);
  });

  it('stops at a rename that throws, naming what it moved', async () => {
    const from = temporaryFolder('dashboard-carry-');
    const to = temporaryFolder('dashboard-carry-');
    writeFileSync(join(from, 'AGENTS.md'), 'rules');
    const moved: string[] = [];
    await expect(moveAll(['AGENTS.md', 'missing.md'], from, to, moved)).rejects.toThrow('ENOENT');
    expect(moved).toEqual(['AGENTS.md']);
    expect(readFileSync(join(to, 'AGENTS.md'), 'utf8')).toBe('rules');
  });

  it('moves back the rest when one move back throws, leaving that one where it was', async () => {
    const aside = temporaryFolder('dashboard-carry-');
    const worktree = temporaryFolder('dashboard-carry-');
    writeFileSync(join(aside, 'AGENTS.md'), 'rules');
    mkdirSync(join(aside, 'coverage'));
    // A tool recreated `coverage/` meanwhile, so the folder cannot go back onto it.
    mkdirSync(join(worktree, 'coverage'));
    writeFileSync(join(worktree, 'coverage', 'new.json'), '{}');

    expect(await moveBack(['AGENTS.md', 'coverage'], aside, worktree)).toEqual(['coverage']);
    expect(readFileSync(join(worktree, 'AGENTS.md'), 'utf8')).toBe('rules');
    expect(existsSync(join(aside, 'coverage'))).toBe(true);
  });

  it('moves the untracked files out beside the worktree and back in', async () => {
    const worktree = cleanWorktree();
    writeFileSync(join(worktree, 'AGENTS.md'), 'rules');
    mkdirSync(join(worktree, 'notes'));
    writeFileSync(join(worktree, 'notes', 'a.md'), 'a');

    const carried = await setAsideUntracked(worktree);
    expect(carried.files).toEqual(['AGENTS.md', 'notes/']);
    expect(existsSync(join(worktree, 'AGENTS.md'))).toBe(false);
    expect(git(worktree, 'status', '--porcelain')).toBe('');

    await carried.restore();
    expect(readFileSync(join(worktree, 'AGENTS.md'), 'utf8')).toBe('rules');
    expect(readFileSync(join(worktree, 'notes', 'a.md'), 'utf8')).toBe('a');
    expect(readdirSync(dirname(worktree))).toEqual(['card']);
  });
});
