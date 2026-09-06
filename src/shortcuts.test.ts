import { describe, expect, it } from 'vitest';
import { mapShortcut, type KeyInput } from './shortcuts';

function key(overrides: Partial<KeyInput>): KeyInput {
  return { key: '', code: '', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...overrides };
}

describe('mapShortcut on macOS', () => {
  it('cycles projects with Cmd+] and Cmd+[', () => {
    expect(mapShortcut(key({ key: ']', metaKey: true }), true)).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ key: '[', metaKey: true }), true)).toEqual({ kind: 'project-previous' });
  });

  it('leaves Cmd+digit to terminals, with nothing on Cmd+Shift+digit', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '#', metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  it('focuses a terminal with Cmd+1..5 and ignores Cmd+6..9', () => {
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true))
      .toEqual({ kind: 'terminal-focus', index: 0 });
    expect(mapShortcut(key({ code: 'Digit5', key: '5', metaKey: true }), true))
      .toEqual({ kind: 'terminal-focus', index: 4 });
    expect(mapShortcut(key({ code: 'Digit6', key: '6', metaKey: true }), true)).toBeNull();
  });

  it('cycles terminals with Cmd+Right and Cmd+Left', () => {
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true }), true)).toEqual({ kind: 'terminal-next' });
    expect(mapShortcut(key({ key: 'ArrowLeft', metaKey: true }), true)).toEqual({ kind: 'terminal-previous' });
  });

  it('ignores shifted non-digit keys', () => {
    expect(mapShortcut(key({ key: ']', metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  // Ctrl+H is taken in every mode, including the one you are in: the screen whose keys you cannot
  // remember is the screen you are looking at.
  it('opens help on Ctrl+H from every mode', () => {
    expect(mapShortcut(key({ key: 'h', ctrlKey: true }), true, 'terminals')).toEqual({ kind: 'help' });
    expect(mapShortcut(key({ key: 'h', ctrlKey: true }), true, 'nvim')).toEqual({ kind: 'help' });
    expect(mapShortcut(key({ key: 'h', ctrlKey: true }), false, 'board')).toEqual({ kind: 'help' });
    expect(mapShortcut(key({ key: 'h', ctrlKey: true, shiftKey: true }), true)).toBeNull();
  });

  it('lets Ctrl through to the shell on macOS, apart from the project and help keys', () => {
    expect(mapShortcut(key({ key: 'c', ctrlKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: ']', ctrlKey: true }), true)).toBeNull();
  });

  it('turns Cmd+Backspace into Ctrl+U, the way Ghostty does', () => {
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true }), true))
      .toEqual({ kind: 'terminal-input', data: '\x15' });
    expect(mapShortcut(key({ key: 'Backspace' }), true)).toBeNull();
    // Shift keeps the plain backspace; Ctrl rides along with Cmd and still clears the line.
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true, ctrlKey: true }), true))
      .toEqual({ kind: 'terminal-input', data: '\x15' });
  });

  it('lets Cmd+C and Cmd+V through for copy and paste', () => {
    expect(mapShortcut(key({ key: 'c', metaKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: 'v', metaKey: true }), true)).toBeNull();
  });

  it('ignores plain keys and Alt combinations', () => {
    expect(mapShortcut(key({ key: ']' }), true)).toBeNull();
    expect(mapShortcut(key({ key: ']', metaKey: true, altKey: true }), true)).toBeNull();
  });
});

describe('mapShortcut elsewhere', () => {
  it('uses Ctrl as the modifier', () => {
    expect(mapShortcut(key({ key: ']', ctrlKey: true }), false)).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ key: ']', metaKey: true }), false)).toBeNull();
  });

  it('leaves Cmd+Backspace alone, since Ctrl+U already reaches the shell', () => {
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true }), false)).toBeNull();
  });

  it('keeps the project keys on plain Ctrl', () => {
    expect(mapShortcut(key({ code: 'KeyO', key: 'o', ctrlKey: true }), false)).toEqual({ kind: 'project-last' });
    expect(mapShortcut(key({ code: 'KeyS', key: 's', ctrlKey: true }), false)).toEqual({ kind: 'project-picker' });
  });
});

describe('mapShortcut on every platform', () => {
  // Ctrl+S opens the project list on both platforms, at the cost of the shell's XOFF and emacs' search.
  it('goes back to the last project with Ctrl+O', () => {
    expect(mapShortcut(key({ code: 'KeyO', key: 'o', ctrlKey: true }), true)).toEqual({ kind: 'project-last' });
    // Caps Lock uppercases `key` without setting shiftKey.
    expect(mapShortcut(key({ code: 'KeyO', key: 'O', ctrlKey: true }), true)).toEqual({ kind: 'project-last' });
    // `key`, not `code`: on Dvorak the O character sits on the physical S key.
    expect(mapShortcut(key({ code: 'KeyS', key: 'o', ctrlKey: true }), true)).toEqual({ kind: 'project-last' });
    // Cmd+O opens nothing; the project list carries the folder dialog.
    expect(mapShortcut(key({ code: 'KeyO', key: 'o', metaKey: true }), true)).toBeNull();
  });

  it('jumps to a project with Ctrl+1..9', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '3', ctrlKey: true }), true)).toEqual({ kind: 'project-jump', index: 2 });
    expect(mapShortcut(key({ code: 'Digit9', key: '9', ctrlKey: true }), false)).toEqual({ kind: 'project-jump', index: 8 });
    // Ctrl+0 is not a project.
    expect(mapShortcut(key({ code: 'Digit0', key: '0', ctrlKey: true }), true)).toBeNull();
  });

  it('moves the current project with Ctrl+Shift+1..9', () => {
    // Shift rewrites `key` ("1" becomes "!"), so the branch reads `code`.
    expect(mapShortcut(key({ code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true }), true))
      .toEqual({ kind: 'project-move', index: 0 });
    expect(mapShortcut(key({ code: 'Digit4', key: '$', ctrlKey: true, shiftKey: true }), false))
      .toEqual({ kind: 'project-move', index: 3 });
  });

  it('opens the project list with Ctrl+S', () => {
    expect(mapShortcut(key({ code: 'KeyS', key: 's', ctrlKey: true }), true)).toEqual({ kind: 'project-picker' });
    expect(mapShortcut(key({ code: 'KeyS', key: 's', ctrlKey: true }), false)).toEqual({ kind: 'project-picker' });
    // Caps Lock uppercases `key` without setting shiftKey.
    expect(mapShortcut(key({ code: 'KeyS', key: 'S', ctrlKey: true }), true)).toEqual({ kind: 'project-picker' });
    // Cmd+S and Ctrl+Alt+S are not it.
    expect(mapShortcut(key({ code: 'KeyS', key: 's', metaKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyS', key: 's', ctrlKey: true, altKey: true }), true)).toBeNull();
  });

  it('moves between panes with Option+hjkl', () => {
    expect(mapShortcut(key({ code: 'KeyH', key: '˙', altKey: true }), true))
      .toEqual({ kind: 'terminal-move', direction: 'left' });
    expect(mapShortcut(key({ code: 'KeyJ', key: '∆', altKey: true }), true))
      .toEqual({ kind: 'terminal-move', direction: 'down' });
    expect(mapShortcut(key({ code: 'KeyK', key: '˚', altKey: true }), true))
      .toEqual({ kind: 'terminal-move', direction: 'up' });
    expect(mapShortcut(key({ code: 'KeyL', key: '¬', altKey: true }), true))
      .toEqual({ kind: 'terminal-move', direction: 'right' });
    // Alt does not rewrite `key` off macOS, and the branch reads `code` either way.
    expect(mapShortcut(key({ code: 'KeyH', key: 'h', altKey: true }), false))
      .toEqual({ kind: 'terminal-move', direction: 'left' });
    expect(mapShortcut(key({ code: 'KeyB', key: '∫', altKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ code: 'KeyH', altKey: true, metaKey: true }), true)).toBeNull();
  });
});

describe('mode keys', () => {
  it('switches mode with Ctrl+T, Ctrl+N and Ctrl+B', () => {
    expect(mapShortcut(key({ key: 'n', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'board' });
    expect(mapShortcut(key({ key: 't', ctrlKey: true }), true, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'terminals' });
  });

  // The whole point of the rule: Ctrl+N is nvim's autocomplete, so nvim keeps it.
  it('leaves the key for the current mode to whatever is running there', () => {
    expect(mapShortcut(key({ key: 'n', ctrlKey: true }), true, 'nvim')).toBeNull();
    expect(mapShortcut(key({ key: 't', ctrlKey: true }), true, 'terminals')).toBeNull();
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true, 'board')).toBeNull();
  });

  it('reads a Caps Lock letter as the same key', () => {
    expect(mapShortcut(key({ key: 'B', ctrlKey: true }), true, 'terminals'))
      .toEqual({ kind: 'mode-set', mode: 'board' });
  });

  it('assumes terminals when no mode is given', () => {
    expect(mapShortcut(key({ key: 'b', ctrlKey: true }), true))
      .toEqual({ kind: 'mode-set', mode: 'board' });
  });

  it('ignores Ctrl+Shift+letter', () => {
    expect(mapShortcut(key({ key: 'b', ctrlKey: true, shiftKey: true }), true, 'terminals')).toBeNull();
  });
});

describe('keys that only mean something in terminals mode', () => {
  it('drops Cmd+digit outside terminals mode', () => {
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'Digit1', key: '1', metaKey: true }), true, 'nvim')).toBeNull();
  });

  it('drops the pane movement keys outside terminals mode', () => {
    expect(mapShortcut(key({ code: 'KeyJ', altKey: true }), true, 'board')).toBeNull();
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true }), true, 'nvim')).toBeNull();
    expect(mapShortcut(key({ key: 'Backspace', metaKey: true }), true, 'board')).toBeNull();
  });

  // Project keys are how you get out of a mode, so they answer from all three.
  it('keeps the project keys working from every mode', () => {
    expect(mapShortcut(key({ key: ']', metaKey: true }), true, 'board')).toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ code: 'Digit2', key: '2', ctrlKey: true }), true, 'nvim'))
      .toEqual({ kind: 'project-jump', index: 1 });
    expect(mapShortcut(key({ key: 's', ctrlKey: true }), true, 'board')).toEqual({ kind: 'project-picker' });
  });
});
