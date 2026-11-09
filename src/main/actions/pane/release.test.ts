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
        unfinished: async () => unfinished,
        removeWorktree: async () => undefined,
      });
    const throwaway = { worktreePath: '/w/work-1', projectPath: '/p' };
    for (const [found, reason] of [[undefined, null], [throwaway, 'uncommitted'], [throwaway, null]] as const) {
      const answer = await releaseWith(found, reason).call({ id: '2:2' });
      expect(answer).toEqual({ output: expect.stringContaining('x.scope was not stopped: timed out') });
    }
  });
});
