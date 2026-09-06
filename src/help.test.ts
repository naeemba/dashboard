import { describe, expect, it } from 'vitest';
import { helpSections } from './help';

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
      .toBe('already here — goes to Board instead');
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
