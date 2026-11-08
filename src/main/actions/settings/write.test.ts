import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../shared/settings/settings';
import { bind } from '../action';
import { settingsWrite } from './write';

describe('settings.write', () => {
  it('keeps the settings with the shell they pick before writing them, and refuses what is not settings', async () => {
    const done: string[] = [];
    const write = bind(settingsWrite, {
      pickShell: () => 'zsh',
      keep: (_settings, shellCommand) => { done.push(`keep ${shellCommand}`); },
      writeFile: () => { done.push('write'); },
    });
    await expect(write.call({ settings: {} as Settings })).resolves.toEqual({ output: 'settings saved', shellCommand: 'zsh' });
    await expect(write.call({ settings: 'zsh' })).resolves.toEqual({ refused: 'the settings were not ones the app could read' });
    expect(done).toEqual(['keep zsh', 'write']);
  });
});
