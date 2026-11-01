import { describe, expect, it } from 'vitest';
import {
  answerDespiteFailure, anyShellStandsIn, familiesOf, lsofDirectories, oneQuestionAtATime, shellStandsIn,
} from './shell-directory';

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

describe('anyShellStandsIn', () => {
  const inProject = { opened: '/work/dashboard', pid: 10 };

  it('asks where each shell is now', () => {
    expect(anyShellStandsIn([inProject], new Map([[10, [WORKTREE]]]), WORKTREE, REAL)).toBe(true);
    expect(anyShellStandsIn([inProject], new Map([[10, ['/work/dashboard']]]), WORKTREE, REAL)).toBe(false);
  });

  // `lsof` stuck on a sleeping network mount and killed: the shell that cd'd in and left a dev server
  // running is still there, and the worktree waits for a tick that gets an answer.
  it('keeps the worktree when the question got no answer', () => {
    expect(anyShellStandsIn([inProject], null, WORKTREE, REAL)).toBe(true);
  });

  it('removes it when there is no shell at all, answer or not', () => {
    expect(anyShellStandsIn([], null, WORKTREE, REAL)).toBe(false);
  });

  it('counts a shell opened in the worktree without needing an answer', () => {
    expect(anyShellStandsIn([{ opened: WORKTREE, pid: 10 }], new Map(), WORKTREE, REAL)).toBe(true);
  });
});

describe('oneQuestionAtATime', () => {
  function counted() {
    let asked = 0;
    let answer: (value: number) => void = () => undefined;
    const ask = oneQuestionAtATime(() => {
      asked += 1;
      return new Promise<number>((resolve) => { answer = resolve; });
    });
    return { ask, asked: () => asked, answer: (value: number) => answer(value) };
  }

  // Three cards waiting on one tick: one `ps` and one `lsof`, not three of each.
  it('gives every call made while one is out that one answer', async () => {
    const question = counted();
    const first = question.ask([10]);
    const second = question.ask([10]);
    question.answer(7);
    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(question.asked()).toBe(1);
  });

  // Pinned so that a caller asking about its own shells finds out here, not by losing a worktree.
  it('gives a call made while one is out the earlier answer, whatever it asked', async () => {
    const question = counted();
    const first = question.ask([10, 11]);
    const second = question.ask([20, 21]);
    question.answer(7);
    expect(await second).toBe(await first);
    expect(question.asked()).toBe(1);
  });

  it('asks again once the last answer is in', async () => {
    const question = counted();
    const first = question.ask([10]);
    question.answer(1);
    await first;
    const second = question.ask([10]);
    question.answer(2);
    expect(await second).toBe(2);
    expect(question.asked()).toBe(2);
  });
});

describe('answerDespiteFailure', () => {
  // lsof exits 1 when a pid in its list has gone, and still prints the rest.
  it('keeps what a command printed when it only exited with an error', () => {
    expect(answerDespiteFailure({ code: 1, killed: false, stdout: 'p10\n' })).toBe('p10\n');
  });

  it('gives no answer for a command killed for taking too long', () => {
    expect(answerDespiteFailure({ code: null, killed: true, signal: 'SIGTERM', stdout: 'p10\n' })).toBeNull();
  });

  it('gives no answer for a command that never ran', () => {
    expect(answerDespiteFailure({ code: 'ENOENT', stdout: '' })).toBeNull();
    expect(answerDespiteFailure(undefined)).toBeNull();
  });
});
