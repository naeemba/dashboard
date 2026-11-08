import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneClose } from './close';

describe('pane.close', () => {
  it('drops an open worker, ends a card record\'s claim on it and redraws, and refuses one not open', async () => {
    const done: string[] = [];
    const close = bind(paneClose, {
      openPanes: () => [0, 2],
      projectPath: () => '/work/api',
      drop: (id) => { done.push(`drop ${id}`); },
      endClaim: (projectPath, index) => { done.push(`claim ${projectPath} ${index}`); },
      changed: () => { done.push('changed'); },
    });
    expect(await close.call({ id: '2:2' })).toEqual({ output: 'closed 2:2' });
    expect(done).toEqual(['drop 2:2', 'claim /work/api 2', 'changed']);
    expect(await close.call({ id: '2:5' })).toEqual({ refused: '2:5 is not open' });
  });
});
