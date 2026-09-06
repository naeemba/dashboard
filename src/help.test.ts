import { describe, expect, it } from 'vitest';
import { helpSections } from './help';
import { mapShortcut, type Action, type KeyInput } from './shortcuts';
import { key } from './test-key';

// The Projects rows are written out by hand, because mapShortcut reads `code` on the digits and `key` on
// the brackets and there is no table to read back. Nothing else stops the two drifting apart, so each row
// here presses the key it names: rename or drop a project shortcut and this fails, instead of leaving
// Ctrl+H quietly telling someone to press a key that does nothing.
const PROJECT_ROWS: { keys: string; press: Partial<KeyInput>; kind: Action['kind'] }[] = [
  { keys: 'Ctrl+S', press: { key: 's', ctrlKey: true }, kind: 'project-picker' },
  { keys: 'Ctrl+O', press: { key: 'o', ctrlKey: true }, kind: 'project-last' },
  { keys: 'Ctrl+1…9', press: { code: 'Digit1', key: '1', ctrlKey: true }, kind: 'project-jump' },
  { keys: 'Ctrl+Shift+1…9', press: { code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true }, kind: 'project-move' },
  { keys: 'Cmd+] / Cmd+[', press: { key: ']', metaKey: true }, kind: 'project-next' },
];

describe('helpSections', () => {
  it('puts the screen you are on first', () => {
    expect(helpSections('board', true)[0].title).toBe('Board');
    expect(helpSections('nvim', true)[0].title).toBe('nvim');
    expect(helpSections('terminals', true)[0].title).toBe('Terminals');
  });

  it('says the mode key you are already on is passed through', () => {
    const modes = helpSections('board', true)[1];
    expect(modes.shortcuts).toContainEqual({ keys: 'Ctrl+T', action: 'Terminals mode' });
    expect(modes.shortcuts.find((shortcut) => shortcut.keys === 'Ctrl+B')?.action)
      .toBe('already here — the screen gets the keystroke');
  });

  it('lists exactly the project keys mapShortcut answers to', () => {
    const projects = helpSections('board', true).find((section) => section.title === 'Projects');
    expect(projects?.shortcuts.map((shortcut) => shortcut.keys)).toEqual(PROJECT_ROWS.map((row) => row.keys));
    for (const row of PROJECT_ROWS) {
      expect(mapShortcut(key(row.press), true, 'board')).toMatchObject({ kind: row.kind });
    }
  });

  it('names Cmd on macOS and Ctrl elsewhere', () => {
    const keys = (isMac: boolean): string[] =>
      helpSections('terminals', isMac).flatMap((section) => section.shortcuts.map((shortcut) => shortcut.keys));
    expect(keys(true)).toContain('Cmd+] / Cmd+[');
    expect(keys(false)).toContain('Ctrl+] / Ctrl+[');
  });

  // Ctrl+1..9 is the projects on every platform, so off macOS there is no modifier left to reach a
  // pane by number and Cmd+Backspace does not exist at all.
  it('leaves out the macOS-only terminal keys off macOS', () => {
    const keys = helpSections('terminals', false)[0].shortcuts.map((shortcut) => shortcut.keys);
    expect(keys).toEqual(['Ctrl+Right / Ctrl+Left', 'Alt+H J K L']);
  });
});
