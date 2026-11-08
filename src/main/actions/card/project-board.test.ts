import { describe, expect, it } from 'vitest';
import { MANAGER_PROJECT } from '../../../shared/manager/manager';
import { isProjectBoard } from './project-board';

// /tmp is a symlink to /private/tmp on a mac: the record keeps one spelling, process.cwd() the other.
const resolve = (folder: string) => folder.replace(/^\/tmp\//, '/private/tmp/');
const unlinked = () => false;

describe('isProjectBoard', () => {
  it('says yes for a project folder no worktree record names', () => {
    expect(isProjectBoard('/work/api', ['/work/api.worktrees/fix-login'], resolve, unlinked)).toBe(true);
  });

  it('says no for a recorded worktree, however the path is spelled', () => {
    expect(isProjectBoard('/work/api.worktrees/fix-login', ['/work/api.worktrees/fix-login'], resolve, unlinked)).toBe(false);
    expect(isProjectBoard('/private/tmp/api.worktrees/fix-login', ['/tmp/api.worktrees/fix-login'], resolve, unlinked)).toBe(false);
  });

  it('says no for a linked worktree no record names', () => {
    expect(isProjectBoard('/work/api.worktrees/fix-login', [], resolve, (folder) => folder === '/work/api.worktrees/fix-login')).toBe(false);
  });

  it('says no for the manager', () => {
    expect(isProjectBoard(MANAGER_PROJECT.path, [], resolve, unlinked)).toBe(false);
  });
});
