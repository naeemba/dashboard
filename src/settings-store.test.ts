import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, settingsFilePath, writeSettings } from './settings-store';
import { defaultSettings } from './settings';

function file(): string {
  return join(mkdtempSync(join(tmpdir(), 'dashboard-settings-')), 'settings.json');
}

describe('settingsFilePath', () => {
  it('sits beside the .env file, under XDG_CONFIG_HOME when there is one', () => {
    expect(settingsFilePath('/home/me', '/elsewhere/config'))
      .toBe(join('/elsewhere/config', 'dashboard', 'settings.json'));
    expect(settingsFilePath('/home/me', undefined))
      .toBe(join('/home/me', '.config', 'dashboard', 'settings.json'));
  });
});

describe('readSettings', () => {
  it('gives the defaults for a file that is not there', () => {
    expect(readSettings(file(), true)).toEqual(defaultSettings(true));
  });

  it('gives the defaults for a file that is not json', () => {
    const path = file();
    writeFileSync(path, '{ this is not json');
    expect(readSettings(path, true)).toEqual(defaultSettings(true));
  });

  it('reads what is there and defaults the rest', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ shellCommand: '/bin/fish' }));
    const settings = readSettings(path, true);
    expect(settings.shellCommand).toBe('/bin/fish');
    expect(settings.keys.help).toBe('Ctrl+H');
  });
});

describe('writeSettings', () => {
  it('makes the directory and writes something readable back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dashboard-settings-')), 'nested', 'settings.json');
    const settings = { ...defaultSettings(true), shellCommand: '/bin/fish' };
    writeSettings(path, settings);
    expect(readSettings(path, true)).toEqual(settings);
    // Indented, because the whole point of this file is that a person opens it.
    expect(readFileSync(path, 'utf8')).toContain('\n  "shellCommand"');
  });

  it('swallows a write it cannot do, the way the session file does', () => {
    expect(() => writeSettings('/', defaultSettings(true))).not.toThrow();
  });
});
