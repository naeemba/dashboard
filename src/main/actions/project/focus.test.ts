import { describe, expect, it } from 'vitest';
import { MANAGER_SLOT } from '../../../shared/manager/manager';
import { bind } from '../action';
import { projectFocus } from './focus';

describe('project.focus', () => {
  it('lands on the project\'s main unless a pane is named, nowhere on a closed project, and always on the manager', async () => {
    const landed: string[] = [];
    const focus = bind(projectFocus, { isOpen: (slot) => slot === 3, land: (paneId) => { landed.push(paneId); } });
    await expect(focus.call({ slot: 3, name: 'web' })).resolves.toEqual({ output: 'switched to web' });
    await focus.call({ slot: 3, index: 2 });
    await expect(focus.call({ slot: 5, index: 1 })).resolves.toEqual({ refused: '5:1 is not open' });
    await focus.call({ slot: MANAGER_SLOT, index: 2 });
    expect(landed).toEqual(['3:0', '3:2', `${MANAGER_SLOT}:2`]);
  });
});
