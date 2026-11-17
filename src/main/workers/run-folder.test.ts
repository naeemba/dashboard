import { describe, expect, it } from 'vitest';
import { runFolderRefusal } from './run-folder';

const worktrees = ['/work/api-mr174', '/work/api.worktrees/card-one'];

describe('runFolderRefusal', () => {
  it('takes the project, a folder inside it, and a worktree of its repository or a folder inside one', () => {
    expect(runFolderRefusal('/work/api', true, '/work/api', worktrees)).toBe(null);
    expect(runFolderRefusal('/work/api/packages/web', true, '/work/api', worktrees)).toBe(null);
    expect(runFolderRefusal('/work/api-mr174', true, '/work/api', worktrees)).toBe(null);
    expect(runFolderRefusal('/work/api-mr174/src', true, '/work/api', worktrees)).toBe(null);
  });

  it('refuses a folder that is not there', () => {
    expect(runFolderRefusal('/work/api-mr174', false, '/work/api', worktrees)).toBe('/work/api-mr174 is not a folder');
  });

  // A sibling whose name starts with the project's is not inside it, and another repository is not one
  // of its worktrees.
  it('refuses a folder outside the project and its worktrees', () => {
    expect(runFolderRefusal('/work/api-other', true, '/work/api', worktrees)).toMatch(/neither inside \/work\/api nor a worktree/);
    expect(runFolderRefusal('/work', true, '/work/api', worktrees)).not.toBe(null);
    expect(runFolderRefusal('/work/crm', true, '/work/api', [])).not.toBe(null);
  });
});
