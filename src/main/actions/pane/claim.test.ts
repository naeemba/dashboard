import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneClaim } from './claim';

describe('pane.claim', () => {
  it('answers pane.open\'s refusal and claims nothing', async () => {
    const claimed: string[] = [];
    const claim = bind(paneClaim, {
      findProject: () => ({ ok: false, message: 'unused' }),
      openProject: async () => 2,
      open: async () => ({ refused: '/work/api is not there' }),
      claimedBy: (id) => { claimed.push(id); },
    });
    expect(await claim.call({ slot: 2 })).toEqual({ refused: '/work/api is not there' });
    expect(claimed).toEqual([]);
  });
});
