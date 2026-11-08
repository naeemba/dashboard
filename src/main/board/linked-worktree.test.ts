import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { isLinkedWorktree } from './linked-worktree';

function folderWithGit(git: string | null): string {
  const folder = temporaryFolder('linked-worktree-');
  if (git === null) mkdirSync(join(folder, '.git'));
  else writeFileSync(join(folder, '.git'), git);
  return folder;
}

describe('isLinkedWorktree', () => {
  it('is a folder whose .git file points into a repository\'s worktrees', () => {
    expect(isLinkedWorktree(folderWithGit('gitdir: /work/api/.git/worktrees/card-1\n'))).toBe(true);
  });

  it('is not a project\'s own checkout, a submodule, or a folder with no .git', () => {
    expect(isLinkedWorktree(folderWithGit(null))).toBe(false);
    expect(isLinkedWorktree(folderWithGit('gitdir: ../.git/modules/vendor\n'))).toBe(false);
    expect(isLinkedWorktree(temporaryFolder('linked-worktree-'))).toBe(false);
  });
});
