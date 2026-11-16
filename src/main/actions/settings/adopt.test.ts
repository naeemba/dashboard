import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../shared/settings/settings';
import { bind } from '../action';
import { settingsAdopt } from './adopt';

describe('settings.adopt', () => {
  it('keeps the file\'s settings with the shell they pick and tells the window, writing nothing', async () => {
    const done: string[] = [];
    const adopt = bind(settingsAdopt, {
      pickShell: (chosen) => chosen.shellCommand || 'zsh',
      keep: (_settings, shellCommand) => { done.push(`keep ${shellCommand}`); },
      tell: (_settings, shellCommand) => { done.push(`tell ${shellCommand}`); },
    });
    await adopt.call({ settings: { shellCommand: '' } as Settings });
    expect(done).toEqual(['keep zsh', 'tell zsh']);
  });
});
