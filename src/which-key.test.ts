import { describe, expect, it } from 'vitest';
import { PASSED_THROUGH } from './shortcut-rows';
import { bindKey, defaultSettings } from './settings';
import { key } from './test-key';
import { heldPrefix, whichKeyRows, type Held } from './which-key';

const mac = defaultSettings(true).keys;
const ctrl: Held = { ctrl: true, meta: false, alt: false, shift: false };
const ctrlShift: Held = { ...ctrl, shift: true };

function rowFor(action: string, held: Held, keys = mac, mode: 'terminals' | 'board' | 'manager' = 'terminals') {
  return whichKeyRows(held, keys, mode, false, true).find((row) => row.action === action);
}

describe('heldPrefix', () => {
  it('answers with what is held while a modifier is pressed on its own', () => {
    expect(heldPrefix(key({ key: 'Control', ctrlKey: true }))).toEqual(ctrl);
    expect(heldPrefix(key({ key: 'Shift', ctrlKey: true, shiftKey: true }))).toEqual(ctrlShift);
  });

  it('says nothing for a key that starts something, so the panel goes when you press one', () => {
    expect(heldPrefix(key({ key: 'b', code: 'KeyB', ctrlKey: true }))).toBeNull();
  });

  it('refuses Shift on its own: a capital is typed with it', () => {
    expect(heldPrefix(key({ key: 'Shift', shiftKey: true }))).toBeNull();
  });

  it('reads a release the same way, so letting go of Shift widens the list back out', () => {
    expect(heldPrefix(key({ key: 'Shift', ctrlKey: true }))).toEqual(ctrl);
    expect(heldPrefix(key({ key: 'Control' }))).toBeNull();
  });
});

describe('whichKeyRows', () => {
  it('names only what is left to press', () => {
    expect(rowFor('Open the settings screen', ctrl)?.keys).toBe(',');
    expect(rowFor('Notes mode', ctrl)?.keys).toBe('Shift+N');
  });

  it('keeps a binding that wants more modifiers, and drops one that wants fewer', () => {
    expect(rowFor('List the worktrees cards were shipped into', ctrl)).toBeDefined();
    expect(rowFor('Open this dialog', ctrlShift)).toBeUndefined();
  });

  it('offers only what the screen you are on would hear', () => {
    const scrollback = "Open this pane's scrollback in nvim";
    expect(rowFor(scrollback, ctrl, mac, 'terminals')).toBeDefined();
    expect(rowFor(scrollback, ctrl, mac, 'board')).toBeUndefined();
  });

  it('says so on the key naming the mode you are already on', () => {
    expect(rowFor(PASSED_THROUGH, ctrl, mac, 'terminals')?.keys).toBe('T');
    expect(rowFor(PASSED_THROUGH, ctrl, mac, 'board')?.keys).toBe('B');
  });

  it('prints a numbered run as one row, and spells it out once one of it has moved', () => {
    expect(rowFor('Jump to a tab', ctrl)?.keys).toBe('1…9');
    const moved = bindKey(defaultSettings(true), 'project-jump-4', 'Ctrl+Alt+P').keys;
    expect(rowFor('Jump to a tab', ctrl, moved)).toBeUndefined();
    expect(rowFor('Jump to tab 4', ctrl, moved)?.keys).toBe('Alt+P');
  });

  it('leaves out an action with no key, which is not a key you could press', () => {
    const other = defaultSettings(false).keys;
    // The five pane keys ship unbound off macOS: Ctrl with a digit already belongs to the projects
    // there, so there is no modifier left to reach a pane by number.
    expect(other['terminal-focus-1']).toBeNull();
    const cmd: Held = { ctrl: false, meta: true, alt: false, shift: false };
    expect(whichKeyRows(cmd, other, 'terminals', false, false)
      .some((row) => row.action.startsWith('Focus a terminal'))).toBe(false);
  });

  it('comes back empty when nothing on this screen starts with what is held', () => {
    const alt: Held = { ctrl: false, meta: false, alt: true, shift: false };
    expect(whichKeyRows(alt, mac, 'board', false, true)).toEqual([]);
  });
});
