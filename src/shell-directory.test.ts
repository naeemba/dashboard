import { describe, expect, it } from 'vitest';
import { familiesOf, lsofDirectories, shellStandsIn } from './shell-directory';

const WORKTREE = '/work/dashboard.worktrees/fix-login';
const REAL = '/private/work/dashboard.worktrees/fix-login';

describe('shellStandsIn', () => {
  // The review pane, or the agent's: opened in the worktree, and killed with it.
  it('counts a shell opened in the worktree, wherever it is now', () => {
    expect(shellStandsIn(WORKTREE, ['/work/dashboard'], WORKTREE, REAL)).toBe(true);
    expect(shellStandsIn(WORKTREE, [], WORKTREE, REAL)).toBe(true);
  });

  // A plain pane you `cd`'d into the worktree to run a dev server from. Left out, the sweep deletes the
  // folder under it.
  it('counts a shell opened in the project that has moved into the worktree', () => {
    expect(shellStandsIn('/work/dashboard', [WORKTREE], WORKTREE, REAL)).toBe(true);
    expect(shellStandsIn('/work/dashboard', [`${WORKTREE}/src/lib`], WORKTREE, REAL)).toBe(true);
  });

  // The operating system answers with symlinks followed.
  it('counts the worktree reached through its real path', () => {
    expect(shellStandsIn('/work/dashboard', [`${REAL}/src`], WORKTREE, REAL)).toBe(true);
  });

  it('does not count a shell somewhere else', () => {
    expect(shellStandsIn('/work/dashboard', ['/work/dashboard'], WORKTREE, REAL)).toBe(false);
    expect(shellStandsIn('/work/dashboard', ['/work/dashboard.worktrees/fix-login-2'], WORKTREE, REAL))
      .toBe(false);
    expect(shellStandsIn('/work/dashboard', ['/work/dashboard.worktrees'], WORKTREE, REAL)).toBe(false);
  });

  // A folder whose name only starts with two dots is still inside.
  it('counts a folder inside whose name begins with two dots', () => {
    expect(shellStandsIn('/work/dashboard', [`${WORKTREE}/..cache`], WORKTREE, REAL)).toBe(true);
  });

  // `pnpm -C ../fix-login dev` from the project: the shell never moves, the dev server is in the
  // worktree. Left out, the sweep deletes the folder under the dev server.
  it('counts a program the shell started in the worktree', () => {
    expect(shellStandsIn('/work/dashboard', ['/work/dashboard', `${WORKTREE}`], WORKTREE, REAL))
      .toBe(true);
  });

  it('falls back to the opened-in folder when the shell could not be asked', () => {
    expect(shellStandsIn('/work/dashboard', [], WORKTREE, REAL)).toBe(false);
  });
});

describe('familiesOf', () => {
  // `ps -eo pid=,ppid=` read by parentProcesses: shell 10 runs pnpm 11, which runs node 12. Shell 20
  // runs nothing. 30 belongs to some other terminal.
  const parents = new Map([[10, 1], [11, 10], [12, 11], [20, 1], [30, 1], [31, 30]]);

  it('gives each shell itself and everything under it', () => {
    const families = familiesOf(parents, [10, 20]);
    expect(families.get(10)).toEqual([10, 11, 12]);
    expect(families.get(20)).toEqual([20]);
  });

  it('leaves each shell on its own when there is no tree to read', () => {
    expect(familiesOf(new Map(), [10])).toEqual(new Map([[10, [10]]]));
  });

  // pid 0 on macOS names itself as its own parent, and a pid reused mid-read can close a loop.
  it('stops on a tree that loops back on itself', () => {
    const looped = new Map([[0, 0], [10, 12], [11, 10], [12, 11]]);
    expect(familiesOf(looped, [10]).get(10)).toEqual([10, 11, 12]);
    expect(familiesOf(looped, [0]).get(0)).toEqual([0]);
  });
});

describe('lsofDirectories', () => {
  it('reads each process off its p line and its folder off the n line after it', () => {
    const output = `p10\nfcwd\nn/work/dashboard\np12\nfcwd\nn${WORKTREE}\n`;
    expect(lsofDirectories(output)).toEqual(new Map([[10, '/work/dashboard'], [12, WORKTREE]]));
  });

  // lsof prints nothing for a pid that has already gone, so it is missing rather than wrong.
  it('answers nothing for processes that were already gone', () => {
    expect(lsofDirectories('')).toEqual(new Map());
  });
});
