import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { isLinkedWorktree } from './linked-worktree';

function folderWithGit(git: string | null, folder = temporaryFolder('linked-worktree-')): string {
  mkdirSync(folder, { recursive: true });
  if (git === null) mkdirSync(join(folder, '.git'));
  else writeFileSync(join(folder, '.git'), git);
  return folder;
}

describe('isLinkedWorktree', () => {
  it('is a folder in its checkout\'s worktrees folder whose .git file points into that checkout', () => {
    const work = temporaryFolder('linked-worktree-');
    mkdirSync(join(work, 'api'));
    const folder = folderWithGit(`gitdir: ${join(work, 'api', '.git', 'worktrees', 'card-1')}\n`, join(work, 'api.worktrees', 'card-1'));
    expect(isLinkedWorktree(folder)).toBe(true);
  });

  it('resolves a relative gitdir against the folder, not the current directory', () => {
    const work = temporaryFolder('linked-worktree-');
    mkdirSync(join(work, 'api'));
    const folder = folderWithGit('gitdir: ../../api/.git/worktrees/card-1\n', join(work, 'api.worktrees', 'card-1'));
    expect(isLinkedWorktree(folder)).toBe(true);
  });

  it('is not a project\'s own checkout, a submodule, or a folder with no .git', () => {
    expect(isLinkedWorktree(folderWithGit(null))).toBe(false);
    expect(isLinkedWorktree(folderWithGit('gitdir: ../.git/modules/vendor\n'))).toBe(false);
    expect(isLinkedWorktree(temporaryFolder('linked-worktree-'))).toBe(false);
  });

  it('is not a bare repository\'s checkout, which is a project of its own', () => {
    expect(isLinkedWorktree(folderWithGit('gitdir: /work/app.git/worktrees/app\n'))).toBe(false);
  });

  it('is not a worktree made by hand outside the checkout\'s worktrees folder', () => {
    const work = temporaryFolder('linked-worktree-');
    mkdirSync(join(work, 'api'));
    expect(isLinkedWorktree(folderWithGit(`gitdir: ${join(work, 'api', '.git', 'worktrees', 'side')}\n`, join(work, 'side')))).toBe(false);
  });
});
