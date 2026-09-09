import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, settingsFilePath, writeSettings } from './settings-store';
import { bindKey, defaultSettings } from './settings';

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
    writeSettings(path, settings, true);
    expect(readSettings(path, true)).toEqual(settings);
    // Indented, because the whole point of this file is that a person opens it.
    expect(readFileSync(path, 'utf8')).toContain('\n  "shellCommand"');
  });

  it('swallows a write it cannot do, the way the session file does', () => {
    expect(() => writeSettings('/', defaultSettings(true), true)).not.toThrow();
  });

  // The bug this guards: change one thing on the settings screen and the whole of everything else was
  // written as if you had picked it, so a default we later have to move never reaches you again.
  it('writes only what you chose', () => {
    const path = file();
    writeSettings(path, { ...defaultSettings(true), font: { name: 'Menlo', size: 14 } }, true);
    expect(JSON.parse(readFileSync(path, 'utf8')))
      .toEqual({ font: { name: 'Menlo', size: 14 }, theme: {}, keys: {} });
  });

  it('writes a key you chose, a key you cleared, and a colour you changed', () => {
    const path = file();
    const chosen = bindKey(defaultSettings(true), 'help', 'Ctrl+Shift+K');
    const settings = { ...bindKey(chosen, 'terminal-clear-line', null), theme: { ...chosen.theme, background: '#101010' } };
    writeSettings(path, settings, true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.keys).toEqual({ help: 'Ctrl+Shift+K', 'terminal-clear-line': null });
    expect(written.theme).toEqual({ background: '#101010' });
    expect(readSettings(path, true)).toEqual(settings);
  });

  // Only what the file names survives a change to the shipped default. Anything it left out follows it —
  // here the mac build had asked for Cmd+Right and nobody chose either, so Linux gets Ctrl+Right.
  it('follows the shipped default the next time it changes', () => {
    const path = file();
    writeSettings(path, bindKey(defaultSettings(true), 'help', 'Ctrl+Shift+K'), true);
    expect(readSettings(path, false).keys)
      .toEqual({ ...defaultSettings(false).keys, help: 'Ctrl+Shift+K' });
  });
});
