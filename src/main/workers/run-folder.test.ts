import { describe, expect, it } from 'vitest';
import { runFolderRefusal, worktreeHolding, worktreeWithin } from './run-folder';

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

describe('worktreeHolding', () => {
  it('names the worktree a folder is in, and nothing for a folder of the checkout', () => {
    expect(worktreeHolding('/work/api-mr174/src', '/work/api', worktrees)).toBe('/work/api-mr174');
    expect(worktreeHolding('/work/api/packages/web', '/work/api', worktrees)).toBeUndefined();
  });

  // Where the --worktree flag of Claude Code puts its worktrees: inside the checkout, and still not it.
  it('names a worktree nested in the checkout, not the checkout', () => {
    const nested = ['/work/api', '/work/api/.claude/worktrees/x'];
    expect(worktreeHolding('/work/api/.claude/worktrees/x/src', '/work/api', nested)).toBe('/work/api/.claude/worktrees/x');
  });

  // The checkout is told apart by the folder, not its spelling.
  it('never names the checkout, however git spells it', () => {
    expect(worktreeHolding('/work/api/src', '/work/api', ['/work/api/'])).toBeUndefined();
  });
});

describe('worktreeWithin', () => {
  const linked = (folder: string) => folder === '/work/api/.claude/worktrees/x';

  it('names the linked worktree between a folder and the root, and nothing for the root\'s own folder', () => {
    expect(worktreeWithin('/work/api/.claude/worktrees/x/src', '/work/api', linked)).toBe('/work/api/.claude/worktrees/x');
    expect(worktreeWithin('/work/api/.claude/worktrees/x', '/work/api', linked)).toBe('/work/api/.claude/worktrees/x');
    expect(worktreeWithin('/work/api/packages/web', '/work/api', linked)).toBeUndefined();
    expect(worktreeWithin('/work/api', '/work/api', linked)).toBeUndefined();
  });
});
