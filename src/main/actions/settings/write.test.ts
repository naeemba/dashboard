import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../shared/settings/settings';
import { bind, isRefused } from '../action';
import { settingsWrite } from './write';

describe('settings.write', () => {
  it('keeps the new settings with the shell they pick, then writes them', async () => {
    const done: string[] = [];
    const write = bind(settingsWrite, {
      pickShell: (chosen) => chosen.shellCommand || 'zsh',
      keep: (_settings, shellCommand) => { done.push(`keep ${shellCommand}`); },
      writeFile: () => { done.push('write'); },
    });
    await expect(write.call({ settings: { shellCommand: '/bin/fish' } as Settings }))
      .resolves.toEqual({ output: 'settings saved', shellCommand: '/bin/fish' });
    expect(done).toEqual(['keep /bin/fish', 'write']);
  });

  it('refuses settings that are not an object, writing nothing', async () => {
    const done: string[] = [];
    const write = bind(settingsWrite, {
      pickShell: () => 'zsh',
      keep: () => { done.push('keep'); },
      writeFile: () => { done.push('write'); },
    });
    expect(isRefused(await write.call({}))).toBe(true);
    expect(done).toEqual([]);
  });
});
