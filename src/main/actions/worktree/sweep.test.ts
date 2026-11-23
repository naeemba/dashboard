import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { worktreeSweep, type WorktreeSweepPorts } from './sweep';

// Project /p with four throwaways on disk: pane 2:3 stands in `held`, `dirty` has uncommitted changes,
// `clean` has nothing to lose, and `broken` is one git fails in.
function sweeping(overrides: Partial<WorktreeSweepPorts> = {}) {
  const done: string[] = [];
  const sweep = bind(worktreeSweep, {
    projects: () => ['/p'],
    throwawaysOf: async () => ['/w/held', '/w/dirty', '/w/clean', '/w/broken'],
    hold: ({ worktreePath }) => (worktreePath === '/w/held' ? '2:3' : undefined),
    exists: () => true,
    prune: async () => undefined,
    unfinished: async (worktreePath) => {
      if (worktreePath === '/w/broken') throw new Error('git status failed');
      return worktreePath === '/w/dirty' ? 'it has uncommitted changes' : null;
    },
    removeWorktree: async (worktreePath, projectPath) => { done.push(`remove ${worktreePath} from ${projectPath}`); },
    log: (draft) => { done.push(`${draft.level} ${draft.message}`); },
    ...overrides,
  });
  return { sweep, done };
}

describe('worktree.sweep', () => {
  it('removes what no pane holds and nothing would be lost from, keeps the rest, and says each in one line', async () => {
    const { sweep, done } = sweeping();
    const output = 'Throwaway worktrees at launch: kept /w/held: pane 2:3 is in it; kept /w/dirty: it has uncommitted changes;'
      + ' removed clean; kept /w/broken: git status failed';
    expect(await sweep.call({})).toEqual({ output });
    expect(done).toEqual(['remove /w/clean from /p', `info ${output}`]);
  });

  it('logs nothing when no project has a throwaway', async () => {
    const { sweep, done } = sweeping({ throwawaysOf: async () => [] });
    expect(await sweep.call({})).toEqual({ output: '' });
    expect(done).toEqual([]);
  });
});
