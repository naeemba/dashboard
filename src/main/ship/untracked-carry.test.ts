import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carriedFiles, setAsideUntracked } from './untracked-carry';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';

describe('carriedFiles', () => {
  it('carries untracked files and folders', () => {
    expect(carriedFiles('?? AGENTS.md\n?? notes/\n')).toEqual(['AGENTS.md', 'notes/']);
  });

  it('carries nothing while a tracked file is changed too', () => {
    expect(carriedFiles(' M src/a.ts\n?? AGENTS.md\n')).toEqual([]);
  });

  it('leaves the board to the removal, untracked or changed', () => {
    expect(carriedFiles('?? .dashboard/board/cards/a.json\n?? AGENTS.md\n')).toEqual(['AGENTS.md']);
    expect(carriedFiles(' M .dashboard/board/cards/a.json\n?? AGENTS.md\n')).toEqual(['AGENTS.md']);
  });
});

describe('setAsideUntracked', () => {
  useGitTestEnvironment();

  it('moves the untracked files out beside the worktree and back in', async () => {
    const worktree = join(temporaryFolder('dashboard-carry-'), 'card');
    mkdirSync(worktree);
    git(worktree, 'init', '--quiet', '--initial-branch', 'main');
    writeFileSync(join(worktree, 'tracked.ts'), 'x');
    git(worktree, 'add', '-A');
    git(worktree, 'commit', '--quiet', '-m', 'start');
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
