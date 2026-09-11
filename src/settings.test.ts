import { describe, expect, it } from 'vitest';
import {
  bindKey, defaultSettings, holderOfBinding, isFontSize, isHexColor, parseSettings, resetKeys,
} from './settings';
import { ACTIONS, scopesOverlap } from './actions';
import { THEME } from './theme';

describe('parseSettings', () => {
  it('gives the defaults for an empty object, a missing file, or rubbish', () => {
    const defaults = defaultSettings(true);
    expect(parseSettings({}, true)).toEqual(defaults);
    expect(parseSettings(null, true)).toEqual(defaults);
    expect(parseSettings('not an object', true)).toEqual(defaults);
    expect(parseSettings([], true)).toEqual(defaults);
  });

  it('gives every action an entry, so nothing downstream deals with a missing key', () => {
    const settings = parseSettings({ keys: { help: 'Ctrl+J' } }, true);
    for (const entry of ACTIONS) expect(settings.keys).toHaveProperty(entry.name);
    expect(settings.keys.help).toBe('Ctrl+J');
    expect(settings.keys['project-picker']).toBe('Ctrl+S');
  });

  it('tells an unbound action apart from a missing one', () => {
    expect(parseSettings({ keys: { help: null } }, true).keys.help).toBeNull();
    expect(parseSettings({ keys: {} }, true).keys.help).toBe('Ctrl+H');
  });

  it('writes a hand-edited binding back in canonical form', () => {
    expect(parseSettings({ keys: { help: 'shift+ctrl+j' } }, true).keys.help).toBe('Ctrl+Shift+J');
  });

  it('costs one setting for one typo, never the whole file', () => {
    const settings = parseSettings({
      keys: { help: 'Hyper+J', 'project-picker': 'Ctrl+G' },
      theme: { red: 'not a colour', green: '#00ff00' },
      font: { name: '', size: 'big' },
      shellCommand: 42,
    }, true);
    expect(settings.keys.help).toBe('Ctrl+H');
    expect(settings.keys['project-picker']).toBe('Ctrl+G');
    expect(settings.theme.red).toBe(THEME.red);
    expect(settings.theme.green).toBe('#00ff00');
    expect(settings.font.name).toBe('JetBrains Mono');
    expect(settings.font.size).toBe(13);
    expect(settings.shellCommand).toBe('');
  });

  it('ignores a colour the theme does not have and a key no action answers to', () => {
    const settings = parseSettings({ theme: { chartreuse: '#7fff00' }, keys: { 'no-such-action': 'Ctrl+Z' } }, true);
    expect(settings.theme).not.toHaveProperty('chartreuse');
    expect(settings.keys).not.toHaveProperty('no-such-action');
  });

  // The screen cannot make this state — bindKey displaces whoever held the key — but a hand-edited
  // file can, and then one of the two silently never fires while both print their key.
  it('takes a clashing key off whichever action comes second', () => {
    const settings = parseSettings({ keys: { 'board-sort': 'U', 'board-undo': 'U' } }, true);
    expect(settings.keys['board-sort']).toBe('U');
    expect(settings.keys['board-undo']).toBeNull();
  });

  // Otherwise the row order in ACTIONS decides it: `board-sort` is listed first, so the default nobody
  // typed would keep S and the line that was typed would come back unbound with nothing saying why.
  it('lets a written binding take a key off a default, whichever is listed first', () => {
    const undo = parseSettings({ keys: { 'board-undo': 'S' } }, true);
    expect(undo.keys['board-undo']).toBe('S');
    expect(undo.keys['board-sort']).toBeNull();
    const help = parseSettings({ keys: { help: 'Ctrl+B' } }, true);
    expect(help.keys.help).toBe('Ctrl+B');
    expect(help.keys['mode-board']).toBeNull();
  });

  // One typo costs one setting: `help` falls back to Ctrl+H, and that fallback must not then unbind the
  // Ctrl+H the file deliberately gave undo.
  it('does not let a typo fall back onto a key another line asked for', () => {
    const settings = parseSettings({ keys: { help: 'Hyper+J', 'board-undo': 'Ctrl+H' } }, true);
    expect(settings.keys['board-undo']).toBe('Ctrl+H');
    expect(settings.keys.help).toBeNull();
  });

  it('leaves a key shared by two screens that never meet alone', () => {
    const settings = parseSettings({ keys: { 'board-sort': 'U', 'terminal-next': 'U' } }, true);
    expect(settings.keys['board-sort']).toBe('U');
    expect(settings.keys['terminal-next']).toBe('U');
  });

  // The file is written back from this object, so its row order is the order a hand-editor sees next time.
  // Settling a clash reorders the loop, not the result: without the seed, the two lines below come back
  // last and the whole file shuffles under someone who only edited one key.
  it('keeps the rows in table order however the clashes were settled', () => {
    const settings = parseSettings({ keys: { 'board-undo': 'S', help: 'Ctrl+B' } }, true);
    expect(Object.keys(settings.keys)).toEqual(ACTIONS.map((entry) => entry.name));
  });

  it('ships different key defaults per platform', () => {
    expect(defaultSettings(true).keys['project-next']).toBe('Cmd+]');
    expect(defaultSettings(false).keys['project-next']).toBe('Ctrl+]');
    expect(defaultSettings(false).keys['terminal-focus-1']).toBeNull();
  });
});

describe('holderOfBinding', () => {
  const settings = defaultSettings(true);

  it('names the action already holding the key', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Ctrl+S')).toBe('project-picker');
  });

  it('says nothing about the action asking, or about a free key', () => {
    expect(holderOfBinding(settings, 'project-picker', 'Ctrl+S')).toBeNull();
    expect(holderOfBinding(settings, 'help', 'Ctrl+Shift+F9')).toBeNull();
  });

  // A board key and a terminal key never meet: neither fires on the other's screen.
  it('lets two screens hold the same key', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Alt+H')).toBeNull();
  });

  // A global key is heard everywhere, so it clashes with both screens and they with it.
  it('catches a clash with a global key from either side', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Ctrl+H')).toBe('help');
    expect(holderOfBinding(settings, 'help', 'D')).toBe('board-delete');
  });
});

describe('bindKey', () => {
  it('gives the key to the action and takes it from whoever had it', () => {
    const next = bindKey(defaultSettings(true), 'board-undo', 'Ctrl+S');
    expect(next.keys['board-undo']).toBe('Ctrl+S');
    expect(next.keys['project-picker']).toBeNull();
  });

  it('unbinds with null and leaves everyone else alone', () => {
    const next = bindKey(defaultSettings(true), 'help', null);
    expect(next.keys.help).toBeNull();
    expect(next.keys['project-picker']).toBe('Ctrl+S');
  });

  it('does not empty the action it is binding when it already holds the key', () => {
    expect(bindKey(defaultSettings(true), 'help', 'Ctrl+H').keys.help).toBe('Ctrl+H');
  });
});

describe('resetKeys', () => {
  it('puts every key back and leaves the rest of the settings alone', () => {
    const changed = { ...bindKey(defaultSettings(true), 'help', null), shellCommand: '/bin/fish' };
    const reset = resetKeys(changed, true);
    expect(reset.keys).toEqual(defaultSettings(true).keys);
    expect(reset.shellCommand).toBe('/bin/fish');
  });
});

describe('the two refusals the settings screen prints', () => {
  it('takes a six-digit hex colour and nothing else', () => {
    expect(isHexColor('#cc6666')).toBe(true);
    expect(isHexColor('#CC6666')).toBe(true);
    expect(isHexColor('#ccc')).toBe(false);
    expect(isHexColor('cc6666')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('')).toBe(false);
  });

  // Outside this range you get a window of panes you cannot read and no way to see the screen that
  // would put it back.
  it('takes a font size between 6 and 72', () => {
    expect(isFontSize('13')).toBe(true);
    expect(isFontSize('13.5')).toBe(true);
    expect(isFontSize('5')).toBe(false);
    expect(isFontSize('73')).toBe(false);
    expect(isFontSize('big')).toBe(false);
    expect(isFontSize('')).toBe(false);
  });
});

describe('holderOfBinding, across overlapping scopes', () => {
  it('sees a manager-page key and a board key as holding the same key', () => {
    // They really do collide: the manager's board is board mode on the manager page, so both are
    // heard there at once.
    expect(scopesOverlap('manager-page', 'board')).toBe(true);
    expect(scopesOverlap('board', 'manager-page')).toBe(true);
  });

  it('sees two screens that are never on at once as free of each other', () => {
    expect(scopesOverlap('terminals', 'board')).toBe(false);
    expect(scopesOverlap('terminals', 'manager-page')).toBe(false);
  });

  it('has global colliding with everything', () => {
    expect(scopesOverlap('global', 'terminals')).toBe(true);
    expect(scopesOverlap('manager-page', 'global')).toBe(true);
  });
});
