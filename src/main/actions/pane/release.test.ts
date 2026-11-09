import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneRelease } from './release';

describe('pane.release', () => {
  it('stops at a refused close and forgets nothing', async () => {
    const forgotten: string[] = [];
    const release = bind(paneRelease, {
      busyWith: () => null,
      mainsWorker: () => true,
      close: async (id) => ({ refused: `${id} is not open` }),
      forget: (id) => { forgotten.push(id); return undefined; },
      exists: () => true,
      prune: async () => undefined,
      unfinished: async () => null,
      removeWorktree: async () => undefined,
    });
    expect(await release.call({ id: '2:5' })).toEqual({ refused: '2:5 is not open' });
    expect(forgotten).toEqual([]);
  });

  it('names a scope close could not stop in every answer', async () => {
    const releaseWith = (throwaway: { worktreePath: string; projectPath: string } | undefined, unfinished: string | null) =>
      bind(paneRelease, {
        busyWith: () => null,
        mainsWorker: () => true,
        close: async (id) => ({ output: `closed ${id}; x.scope was not stopped: timed out` }),
        forget: () => throwaway,
        exists: () => true,
        prune: async () => undefined,
        unfinished: async () => unfinished,
        removeWorktree: async () => undefined,
      });
    const throwaway = { worktreePath: '/w/work-1', projectPath: '/p' };
    for (const [found, reason] of [[undefined, null], [throwaway, 'uncommitted'], [throwaway, null]] as const) {
      const answer = await releaseWith(found, reason).call({ id: '2:2' });
      expect(answer).toEqual({ output: expect.stringContaining('x.scope was not stopped: timed out') });
    }
  });

  // A merge with `gh pr merge --delete-branch` removes the branch's worktree before main releases its
  // worker: asking git about that folder would fail as `spawn git ENOENT`.
  // A folder deleted by hand is still registered with git, which keeps its branch checked out: pruned.
  it('neither asks about nor removes a throwaway whose folder is already gone, but prunes it', async () => {
    const asked: string[] = [];
    const release = bind(paneRelease, {
      busyWith: () => null,
      mainsWorker: () => true,
      close: async (id) => ({ output: `closed ${id}` }),
      forget: () => ({ worktreePath: '/w/work-1', projectPath: '/p' }),
      exists: () => false,
      prune: async (projectPath) => { asked.push(`prune ${projectPath}`); },
      unfinished: async (worktreePath) => { asked.push(`unfinished ${worktreePath}`); return null; },
      removeWorktree: async (worktreePath) => { asked.push(`remove ${worktreePath}`); },
    });
    expect(await release.call({ id: '2:2' })).toEqual({ output: 'released 2:2; work-1 was already removed' });
    expect(asked).toEqual(['prune /p']);
  });
});
