import { describe, expect, it } from 'vitest';
import { diskUsageBytes, distinctWorktrees, formatSize, parseEveryWorktree, parseWorktreeList } from './git-worktrees';

const LIST = [
  'worktree /code/crm',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /code/crm.worktrees/feature',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feat/thing',
  '',
  'worktree /code/crm/.worktrees/pr 7',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  '',
  'worktree /code/gone',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/gone',
  'prunable gitdir file points to non-existent location',
].join('\n');

describe('parseWorktreeList', () => {
  it('lists every linked worktree and leaves the project checkout out', () => {
    expect(parseWorktreeList(LIST, '/code/crm')).toEqual([
      { projectPath: '/code/crm', worktreePath: '/code/crm.worktrees/feature', branch: 'feat/thing' },
      { projectPath: '/code/crm', worktreePath: '/code/crm/.worktrees/pr 7', branch: 'detached 3333333', detached: true },
      { projectPath: '/code/crm', worktreePath: '/code/gone', branch: 'gone' },
    ]);
  });

  it('finds nothing in a project with no worktrees', () => {
    expect(parseWorktreeList('worktree /code/crm\nHEAD 1\nbranch refs/heads/main', '/code/crm')).toEqual([]);
  });

  // The leftover sweep keeps a locked worktree, with or without a reason after the word.
  it('marks a locked worktree, and only a locked one', () => {
    const listed = parseWorktreeList([
      'worktree /code/crm', 'HEAD 1', 'branch refs/heads/main', '',
      'worktree /code/crm.worktrees/a', 'HEAD 2', 'branch refs/heads/a', 'locked', '',
      'worktree /code/crm.worktrees/b', 'HEAD 3', 'branch refs/heads/b', 'locked keep', '',
      'worktree /code/crm.worktrees/c', 'HEAD 4', 'branch refs/heads/c',
    ].join('\n'), '/code/crm');
    expect(listed.map((worktree) => worktree.locked)).toEqual([true, true, undefined]);
    expect('locked' in listed[2]).toBe(false);
  });
});

// A project opened at a linked worktree: git still prints the main checkout first, and --in may name it.
describe('parseEveryWorktree', () => {
  it('keeps the main checkout git lists first', () => {
    expect(parseEveryWorktree(LIST, '/code/crm.worktrees/feature').map((worktree) => worktree.worktreePath))
      .toEqual(['/code/crm', '/code/crm.worktrees/feature', '/code/crm/.worktrees/pr 7', '/code/gone']);
  });
});

describe('distinctWorktrees', () => {
  const worktree = (projectPath: string, worktreePath: string) => ({ projectPath, worktreePath, branch: 'b' });

  it('answers under the record\'s spelling of a path git prints resolved', () => {
    const records = new Map([['/real/crm.worktrees/a', { projectPath: '/link/crm', worktreePath: '/link/crm.worktrees/a' }]]);
    expect(distinctWorktrees([worktree('/link/crm', '/real/crm.worktrees/a')], records, new Set()))
      .toEqual([worktree('/link/crm', '/link/crm.worktrees/a')]);
  });

  it('lists an unrecorded worktree two open projects share once, under the first', () => {
    expect(distinctWorktrees([worktree('/crm', '/w'), worktree('/crm.worktrees/x', '/w')], new Map(), new Set()))
      .toEqual([worktree('/crm', '/w')]);
  });

  // The linked project sits in an earlier slot than its main checkout. Handing the card's worktree to
  // it would leave the card's own row under /crm with nothing to read a size from.
  it('gives a recorded worktree to the project its record names, whichever lists it first', () => {
    const records = new Map([['/crm.worktrees/card', { projectPath: '/crm', worktreePath: '/crm.worktrees/card' }]]);
    expect(distinctWorktrees(
      [worktree('/crm.worktrees/x', '/crm.worktrees/card'), worktree('/crm', '/crm.worktrees/card')], records, new Set(),
    )).toEqual([worktree('/crm', '/crm.worktrees/card')]);
  });

  it('never offers another open project\'s folder for removal', () => {
    expect(distinctWorktrees(
      [worktree('/crm', '/crm.worktrees/x'), worktree('/crm', '/w')], new Map(), new Set(['/crm', '/crm.worktrees/x']),
    )).toEqual([worktree('/crm', '/w')]);
  });

  // git lists the main checkout first even when asked from a linked worktree, so the project's own
  // folder comes back among the others and would be offered for removal from under its own shells.
  it('leaves out the project itself when the project is a linked worktree', () => {
    const listed = parseWorktreeList(LIST, '/link/crm.worktrees/feature');
    expect(distinctWorktrees(listed, new Map(), new Set(['/code/crm.worktrees/feature']))
      .map((worktree) => worktree.worktreePath)).toEqual(['/code/crm/.worktrees/pr 7', '/code/gone']);
  });
});

describe('diskUsageBytes', () => {
  it('reads du -sk in kilobytes', () => {
    expect(diskUsageBytes('2048\t/code/crm.worktrees/feature\n')).toBe(2048 * 1024);
  });

  it('answers null for output with no number', () => {
    expect(diskUsageBytes('')).toBeNull();
  });
});

describe('formatSize', () => {
  it('says a folder not yet measured is being measured', () => {
    expect(formatSize(null)).toBe('…');
  });

  it('says a folder that could not be measured gave up', () => {
    expect(formatSize('unmeasurable')).toBe('?');
  });

  it('keeps one decimal only under ten', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2.34 * 1024 ** 3)).toBe('2.3 GB');
    expect(formatSize(840 * 1024 ** 2)).toBe('840 MB');
  });
});
