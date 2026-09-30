import { describe, expect, it } from 'vitest';
import { lsofDirectory, shellStandsIn } from './shell-directory';

const WORKTREE = '/work/dashboard.worktrees/fix-login';
const REAL = '/private/work/dashboard.worktrees/fix-login';

describe('shellStandsIn', () => {
  // The review pane, or the agent's: opened in the worktree, and killed with it.
  it('counts a shell opened in the worktree, wherever it is now', () => {
    expect(shellStandsIn(WORKTREE, '/work/dashboard', WORKTREE, REAL)).toBe(true);
    expect(shellStandsIn(WORKTREE, null, WORKTREE, REAL)).toBe(true);
  });

  // A plain pane you `cd`'d into the worktree to run a dev server from. Left out, the sweep deletes the
  // folder under it.
  it('counts a shell opened in the project that has moved into the worktree', () => {
    expect(shellStandsIn('/work/dashboard', WORKTREE, WORKTREE, REAL)).toBe(true);
    expect(shellStandsIn('/work/dashboard', `${WORKTREE}/src/lib`, WORKTREE, REAL)).toBe(true);
  });

  // The operating system answers with symlinks followed.
  it('counts the worktree reached through its real path', () => {
    expect(shellStandsIn('/work/dashboard', `${REAL}/src`, WORKTREE, REAL)).toBe(true);
  });

  it('does not count a shell somewhere else', () => {
    expect(shellStandsIn('/work/dashboard', '/work/dashboard', WORKTREE, REAL)).toBe(false);
    expect(shellStandsIn('/work/dashboard', '/work/dashboard.worktrees/fix-login-2', WORKTREE, REAL))
      .toBe(false);
    expect(shellStandsIn('/work/dashboard', '/work/dashboard.worktrees', WORKTREE, REAL)).toBe(false);
  });

  // A folder whose name only starts with two dots is still inside.
  it('counts a folder inside whose name begins with two dots', () => {
    expect(shellStandsIn('/work/dashboard', `${WORKTREE}/..cache`, WORKTREE, REAL)).toBe(true);
  });

  it('falls back to the opened-in folder when the shell could not be asked', () => {
    expect(shellStandsIn('/work/dashboard', null, WORKTREE, REAL)).toBe(false);
  });
});

describe('lsofDirectory', () => {
  it('reads the folder off the n line', () => {
    expect(lsofDirectory(`p4242\nfcwd\nn${WORKTREE}\n`)).toBe(WORKTREE);
  });

  it('answers null for a process that was already gone', () => {
    expect(lsofDirectory('')).toBeNull();
  });
});
