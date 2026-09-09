import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, settingsFilePath, tidySettingsFile, writeSettings } from './settings-store';
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

describe('tidySettingsFile', () => {
  // The file an older build wrote: every shipped key and colour spelled out as if you had picked them,
  // which is what stopped a default we later moved from ever reaching these people.
  it('takes out the lines that match what this build ships', () => {
    const path = file();
    const shipped = defaultSettings(true);
    writeFileSync(path, JSON.stringify({ ...shipped, font: { name: 'Menlo', size: shipped.font.size } }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8')))
      .toEqual({ font: { name: 'Menlo' }, theme: {}, keys: {} });
  });

  // The rule is "this is what we ship, so leave it out", not "this line is called shellCommand". Nothing
  // here names a setting, so the setting somebody adds next is covered the day they add it — otherwise
  // its shipped value is written into everyone's file and frozen there, which is the whole failure this
  // function exists to stop, and every test would still be green.
  it('takes out any top-level line that matches, whatever it is called', () => {
    const path = file();
    const shipped: Record<string, unknown> = { ...defaultSettings(true) };
    const scalars = Object.entries(shipped).filter(([, value]) => typeof value !== 'object');
    expect(scalars.length).toBeGreaterThan(0);
    writeFileSync(path, JSON.stringify({ ...Object.fromEntries(scalars), mine: 'kept' }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ mine: 'kept' });
  });

  // You meant 13.0 and typed 130, and #fff instead of #ffffff. Both are refused when the file is read,
  // so the panes come up shipped-size and shipped-colour and you open the file to find the mistake. It
  // has to still be there.
  it('leaves a line it cannot read exactly where you typed it', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ font: { size: 130 }, theme: { background: '#fff' } }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8')))
      .toEqual({ font: { size: 130 }, theme: { background: '#fff' } });
  });

  // "theme" is a group here and a word there. Somebody reaching for a theme by name has to be able to
  // open the file and see what they typed, not an empty object where their word used to be.
  it('leaves a group the file gave a value instead of an object', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ theme: 'dark' }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ theme: 'dark' });
  });

  // Valid JSON, but not an object. There is nothing here to take a line out of, and turning the whole
  // file into one leaves nothing to fix.
  it('leaves a file that is json but not an object', () => {
    for (const text of ['null', '[1, 2]', '"hello"']) {
      const path = file();
      writeFileSync(path, text);
      tidySettingsFile(path, true);
      expect(readFileSync(path, 'utf8')).toBe(text);
    }
  });

  // Two actions on one key: reading the file takes the key off the loser, and writing that back would
  // say in the file that you asked for no key there. Then you fix the clash and it still does nothing.
  it('keeps both sides of a clash, so fixing one gives the other its key back', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ keys: { help: 'Ctrl+J', 'board-open': 'Ctrl+J' } }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8')).keys)
      .toEqual({ help: 'Ctrl+J', 'board-open': 'Ctrl+J' });
  });

  // The tidy keeps it; a save does not, because a save writes the settings parseSettings read and the
  // field was never in them. Both halves are pinned here so the first is not read as a promise.
  it('keeps a field this build knows nothing about, which a save then drops', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ somethingLater: 'mine' }));
    tidySettingsFile(path, true);
    expect(JSON.parse(readFileSync(path, 'utf8')).somethingLater).toBe('mine');
    writeSettings(path, { ...defaultSettings(true), font: { name: 'Menlo', size: 14 } }, true);
    expect(JSON.parse(readFileSync(path, 'utf8')).somethingLater).toBe(undefined);
  });

  // A launch that takes nothing out must not touch the file, or a settings.json tracked in a dotfiles
  // repo shows up as changed after every start.
  it('does not rewrite a file it has nothing to take out of', () => {
    const path = file();
    writeSettings(path, { ...defaultSettings(true), font: { name: 'Menlo', size: 14 } }, true);
    const before = readFileSync(path, 'utf8');
    tidySettingsFile(path, true);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('leaves a damaged file and a missing one alone', () => {
    const path = file();
    writeFileSync(path, '{ this is not json');
    tidySettingsFile(path, true);
    expect(readFileSync(path, 'utf8')).toBe('{ this is not json');
    const missing = file();
    tidySettingsFile(missing, true);
    expect(existsSync(missing)).toBe(false);
  });
});
