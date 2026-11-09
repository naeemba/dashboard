import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneClose, type PaneClosePorts } from './close';

function closeWith(done: string[], ports: Partial<PaneClosePorts> = {}) {
  return bind(paneClose, {
    openPanes: () => [0, 2],
    project: () => ({ path: '/work/api' }),
    scopeOf: () => undefined,
    drop: (id) => { done.push(`drop ${id}`); },
    endClaim: (projectPath, index) => { done.push(`claim ${projectPath} ${index}`); },
    changed: () => { done.push('changed'); },
    stopScope: async (unit) => { done.push(`stop ${unit}`); },
    ...ports,
  });
}

describe('pane.close', () => {
  it('drops an open worker, ends a card record\'s claim on it and redraws, and refuses one not open', async () => {
    const done: string[] = [];
    const close = closeWith(done);
    expect(await close.call({ id: '2:2' })).toEqual({ output: 'closed 2:2' });
    expect(done).toEqual(['drop 2:2', 'claim /work/api 2', 'changed']);
    expect(await close.call({ id: '2:5' })).toEqual({ refused: '2:5 is not open' });
  });

  it('stops the pane\'s scope after its shell is dropped, the unit read before the drop forgets it', async () => {
    const done: string[] = [];
    const units = new Map([['2:2', 'agent-api-2-k4f2.scope']]);
    const close = closeWith(done, {
      scopeOf: (id) => units.get(id),
      drop: (id) => { units.delete(id); done.push(`drop ${id}`); },
    });
    expect(await close.call({ id: '2:2' })).toEqual({ output: 'closed 2:2' });
    expect(done).toEqual(['drop 2:2', 'claim /work/api 2', 'changed', 'stop agent-api-2-k4f2.scope']);
  });

  it('closes the pane anyway when its scope will not stop, and says so', async () => {
    const done: string[] = [];
    const close = closeWith(done, {
      scopeOf: () => 'pane-api-2-k4f2.scope',
      stopScope: async () => { throw new Error('Access denied'); },
    });
    expect(await close.call({ id: '2:2' })).toEqual({ output: 'closed 2:2; pane-api-2-k4f2.scope was not stopped: Access denied' });
    expect(done).toEqual(['drop 2:2', 'claim /work/api 2', 'changed']);
  });

  it('stops nothing for a pane that is not open', async () => {
    const done: string[] = [];
    const close = closeWith(done, { scopeOf: () => 'pane-api-5-k4f2.scope' });
    await close.call({ id: '2:5' });
    expect(done).toEqual([]);
  });
});
