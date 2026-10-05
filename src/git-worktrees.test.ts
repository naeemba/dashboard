import { describe, expect, it } from 'vitest';
import { diskUsageBytes, formatSize, parseWorktreeList } from './git-worktrees';

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
      { projectPath: '/code/crm', worktreePath: '/code/crm/.worktrees/pr 7', branch: 'detached 3333333' },
      { projectPath: '/code/crm', worktreePath: '/code/gone', branch: 'gone' },
    ]);
  });

  it('finds nothing in a project with no worktrees', () => {
    expect(parseWorktreeList('worktree /code/crm\nHEAD 1\nbranch refs/heads/main', '/code/crm')).toEqual([]);
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

  it('keeps one decimal only under ten', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2.34 * 1024 ** 3)).toBe('2.3 GB');
    expect(formatSize(840 * 1024 ** 2)).toBe('840 MB');
  });
});
