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
});
