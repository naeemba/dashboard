import { describe, expect, it } from 'vitest';
import { parseBinding } from './binding';
import type { Mode } from './modes';
import { PASSED_THROUGH } from './shortcut-rows';
import { bindKey, defaultSettings } from './settings';
import { mapShortcut } from './shortcuts';
import { key } from './test-key';
import { heldPrefix, whichKeyRows, whichKeyStep, type Held } from './which-key';

const mac = defaultSettings(true).keys;
const ctrl: Held = { ctrl: true, meta: false, alt: false, shift: false };
const ctrlShift: Held = { ...ctrl, shift: true };
const cmd: Held = { ctrl: false, meta: true, alt: false, shift: false };
const alt: Held = { ctrl: false, meta: false, alt: true, shift: false };
const noDialog = () => false;

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
    expect(whichKeyRows(cmd, other, 'terminals', false, false)
      .some((row) => row.action.startsWith('Focus a terminal'))).toBe(false);
  });

  it('comes back empty when nothing on this screen starts with what is held', () => {
    expect(whichKeyRows(alt, mac, 'board', false, true)).toEqual([]);
  });

  // The same check help.test.ts makes on the dialog, and the strip needs it more: the dialog prints the
  // binding, while this takes the binding apart and prints what is left of it, so a bug in `covers` or
  // in what is subtracted invents a key nobody bound. Put the held modifiers back on the row and the
  // window's own lookup has to answer.
  it('names only keys mapShortcut actually answers to', () => {
    const screens: readonly (readonly [Mode, boolean])[] = [
      ['terminals', false], ['board', false],
      ['manager', true], ['board', true], ['command', true],
    ];
    for (const [mode, onManagerPage] of screens) {
      for (const held of [ctrl, ctrlShift, cmd, alt]) {
        for (const row of whichKeyRows(held, mac, mode, onManagerPage, true)) {
          // The mode key you are already on is listed precisely because it does nothing here.
          if (row.action === PASSED_THROUGH) continue;
          // A collapsed family names its first and last key; both ends must work.
          for (const text of row.keys.split('…')) {
            const stroke = parseBinding(text);
            if (stroke === null) throw new Error(`${mode}: the strip printed ${text}, not a key`);
            const pressed = key({
              code: stroke.code,
              ctrlKey: stroke.ctrl || held.ctrl,
              metaKey: stroke.meta || held.meta,
              altKey: stroke.alt || held.alt,
              shiftKey: stroke.shift || held.shift,
            });
            expect(mapShortcut(pressed, mac, mode, onManagerPage), `${mode}: ${text}`).not.toBeNull();
          }
        }
      }
    }
  });
});

describe('whichKeyStep', () => {
  it('asks for the strip when a modifier goes down, and once only while it is held', () => {
    const down = key({ key: 'Control', ctrlKey: true });
    expect(whichKeyStep(down, noDialog, null)).toEqual({ kind: 'show', held: ctrl });
    expect(whichKeyStep(down, noDialog, ctrl)).toEqual({ kind: 'unchanged' });
  });

  it('asks again when a second modifier joins, so the list narrows under your hand', () => {
    expect(whichKeyStep(key({ key: 'Shift', ctrlKey: true, shiftKey: true }), noDialog, ctrl))
      .toEqual({ kind: 'show', held: ctrlShift });
  });

  it('takes the strip away when you press a key that starts something', () => {
    expect(whichKeyStep(key({ key: 'b', code: 'KeyB', ctrlKey: true }), noDialog, ctrl))
      .toEqual({ kind: 'hide' });
  });

  // Without this the strip would be told to hide on every character anybody types.
  it('says nothing changed when the strip is already down', () => {
    expect(whichKeyStep(key({ key: 'b', code: 'KeyB' }), noDialog, null)).toEqual({ kind: 'unchanged' });
  });

  it('stays away while a dialog is up, which owns the keyboard', () => {
    expect(whichKeyStep(key({ key: 'Control', ctrlKey: true }), () => true, null)).toEqual({ kind: 'unchanged' });
    expect(whichKeyStep(key({ key: 'Control', ctrlKey: true }), () => true, ctrl)).toEqual({ kind: 'hide' });
  });

  // The cheap question first: a dialog is found by walking a document full of terminal rows, and every
  // character anybody types arrives here.
  it('does not go looking for a dialog for a key that is not a modifier', () => {
    let asked = 0;
    whichKeyStep(key({ key: 'b', code: 'KeyB' }), () => { asked += 1; return false; }, null);
    expect(asked).toBe(0);
  });
});
