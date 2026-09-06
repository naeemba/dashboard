import { describe, expect, it } from 'vitest';
import { mapShortcut } from './shortcuts';
import { bindKey, defaultSettings } from './settings';
import { key } from './test-key';

const mac = defaultSettings(true).keys;
const other = defaultSettings(false).keys;

describe('mapShortcut', () => {
  it('cycles projects, with the platform its own default decided', () => {
    expect(mapShortcut(key({ code: 'BracketRight', metaKey: true }), mac))
      .toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ code: 'BracketLeft', ctrlKey: true }), other))
      .toEqual({ kind: 'project-previous' });
    // The other platform's key is not bound here, so it does nothing rather than doing both.
    expect(mapShortcut(key({ code: 'BracketRight', ctrlKey: true }), mac)).toBeNull();
  });

  it('reads the physical digit, whatever character Shift made of it', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '3', ctrlKey: true }), mac))
      .toEqual({ kind: 'project-jump', index: 2 });
    expect(mapShortcut(key({ code: 'Digit3', key: '#', ctrlKey: true, shiftKey: true }), mac))
      .toEqual({ kind: 'project-move', index: 2 });
  });

  it('focuses a pane by number on macOS only, and only in terminals mode', () => {
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), mac, 'terminals'))
      .toEqual({ kind: 'terminal-focus', index: 0 });
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), mac, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), other, 'terminals')).toBeNull();
  });

  it('moves between panes on Option+HJKL, whatever character Option made of the key', () => {
    expect(mapShortcut(key({ code: 'KeyH', key: '˙', altKey: true }), mac, 'terminals'))
      .toEqual({ kind: 'terminal-move', direction: 'left' });
    expect(mapShortcut(key({ code: 'KeyH', key: '˙', altKey: true }), mac, 'nvim')).toBeNull();
  });

  // The screen whose keys you cannot remember is the screen you are looking at.
  it('opens help and settings from every mode', () => {
    for (const mode of ['terminals', 'nvim', 'board'] as const) {
      expect(mapShortcut(key({ code: 'KeyH', ctrlKey: true }), mac, mode)).toEqual({ kind: 'help' });
      expect(mapShortcut(key({ code: 'Comma', ctrlKey: true }), mac, mode)).toEqual({ kind: 'settings' });
    }
  });

  // Ctrl+N is nvim's autocomplete and Ctrl+T is the shell's transpose. You leave a mode by naming a
  // different one.
  it('passes the mode key you are already on through to the screen', () => {
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), mac, 'nvim')).toBeNull();
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), mac, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
  });

  it('keeps the board keys on the board, so a bare D never reaches a shell', () => {
    expect(mapShortcut(key({ code: 'KeyD' }), mac, 'board')).toEqual({ kind: 'board-delete' });
    expect(mapShortcut(key({ code: 'KeyD' }), mac, 'terminals')).toBeNull();
    expect(mapShortcut(key({ code: 'ArrowUp' }), mac, 'board'))
      .toEqual({ kind: 'board-select', direction: 'up' });
    expect(mapShortcut(key({ code: 'ArrowUp', shiftKey: true }), mac, 'board'))
      .toEqual({ kind: 'board-move', direction: 'up' });
    expect(mapShortcut(key({ code: 'ArrowUp' }), mac, 'terminals')).toBeNull();
  });

  it('follows a rebinding, and the pass-through rule follows it too', () => {
    const rebound = bindKey(defaultSettings(true), 'mode-nvim', 'Ctrl+J').keys;
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), rebound, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'KeyJ', ctrlKey: true }), rebound, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
    expect(mapShortcut(key({ code: 'KeyJ', ctrlKey: true }), rebound, 'nvim')).toBeNull();
  });

  it('never fires an action with no key', () => {
    const unbound = bindKey(defaultSettings(true), 'help', null).keys;
    expect(mapShortcut(key({ code: 'KeyH', ctrlKey: true }), unbound, 'board')).toBeNull();
  });

  // A binding names an exact keystroke. Loosen it and a modifier held along the way fires the same
  // action as the plain keystroke, which is another way of saying two shortcuts can never share a key.
  it('requires the exact modifiers a binding names, with none extra', () => {
    expect(mapShortcut(key({ code: 'Backspace', metaKey: true }), mac, 'terminals'))
      .toEqual({ kind: 'terminal-input', data: '\x15' });
    expect(mapShortcut(key({ code: 'Backspace', metaKey: true, ctrlKey: true }), mac, 'terminals')).toBeNull();
    expect(mapShortcut(key({ code: 'KeyS', ctrlKey: true }), mac)).toEqual({ kind: 'project-picker' });
    expect(mapShortcut(key({ code: 'KeyS', ctrlKey: true, altKey: true }), mac)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }), mac)).toBeNull();
  });

  it('leaves an unbound combination alone, so copy, paste and the window switcher still work', () => {
    expect(mapShortcut(key({ code: 'KeyC', metaKey: true }), mac)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyV', metaKey: true }), mac)).toBeNull();
    expect(mapShortcut(key({ code: 'BracketRight', metaKey: true, altKey: true }), mac)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyH', ctrlKey: true, shiftKey: true }), mac)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyB', altKey: true }), mac, 'terminals')).toBeNull();
  });

  it('opens the project list and goes back to the last project from every mode', () => {
    for (const mode of ['terminals', 'nvim', 'board'] as const) {
      expect(mapShortcut(key({ code: 'KeyS', ctrlKey: true }), mac, mode)).toEqual({ kind: 'project-picker' });
      expect(mapShortcut(key({ code: 'KeyO', ctrlKey: true }), mac, mode)).toEqual({ kind: 'project-last' });
    }
  });

  it('keeps terminal-scoped actions off the screens that have no panes', () => {
    for (const mode of ['nvim', 'board'] as const) {
      expect(mapShortcut(key({ code: 'ArrowRight', metaKey: true }), mac, mode)).toBeNull();
      expect(mapShortcut(key({ code: 'ArrowLeft', metaKey: true }), mac, mode)).toBeNull();
      expect(mapShortcut(key({ code: 'Backspace', metaKey: true }), mac, mode)).toBeNull();
    }
  });
});
