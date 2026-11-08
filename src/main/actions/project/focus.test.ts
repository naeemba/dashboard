import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { projectFocus } from './focus';

describe('project.focus', () => {
  it('lands on the project\'s main unless a pane is named, and nowhere on a closed project', async () => {
    const landed: string[] = [];
    const focus = bind(projectFocus, { isOpen: (slot) => slot === 3, land: (paneId) => { landed.push(paneId); } });
    await expect(focus.call({ slot: 3, name: 'web' })).resolves.toEqual({ output: 'switched to web' });
    await focus.call({ slot: 3, index: 2 });
    await expect(focus.call({ slot: 5, index: 1 })).resolves.toEqual({ refused: '5:1 is not open' });
    expect(landed).toEqual(['3:0', '3:2']);
  });
});
