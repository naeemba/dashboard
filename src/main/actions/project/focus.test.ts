import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { projectFocus } from './focus';

describe('project.focus', () => {
  it('lands on the project\'s main unless a pane is named', async () => {
    const landed: string[] = [];
    const focus = bind(projectFocus, { land: (paneId) => { landed.push(paneId); } });
    await focus.call({ slot: 3 });
    await focus.call({ slot: 3, index: 2 });
    expect(landed).toEqual(['3:0', '3:2']);
  });
});
