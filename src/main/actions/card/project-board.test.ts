import { describe, expect, it } from 'vitest';
import { MANAGER_PROJECT } from '../../../shared/manager/manager';
import { isProjectBoard } from './project-board';

// /tmp is a symlink to /private/tmp on a mac: the record keeps one spelling, process.cwd() the other.
const resolve = (folder: string) => folder.replace(/^\/tmp\//, '/private/tmp/');

describe('isProjectBoard', () => {
  it('says yes for a project folder no worktree record names', () => {
    expect(isProjectBoard('/work/api', ['/work/api.worktrees/fix-login'], resolve)).toBe(true);
  });

  it('says no for a recorded worktree, however the path is spelled', () => {
    expect(isProjectBoard('/work/api.worktrees/fix-login', ['/work/api.worktrees/fix-login'], resolve)).toBe(false);
    expect(isProjectBoard('/private/tmp/api.worktrees/fix-login', ['/tmp/api.worktrees/fix-login'], resolve)).toBe(false);
  });

  it('says no for the manager', () => {
    expect(isProjectBoard(MANAGER_PROJECT.path, [], resolve)).toBe(false);
  });
});
