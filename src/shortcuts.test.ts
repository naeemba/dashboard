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

  it('jumps to a project with Cmd+Shift+digit', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '#', metaKey: true, shiftKey: true }), true))
      .toEqual({ kind: 'project-jump', index: 2 });
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
    expect(mapShortcut(key({ key: '}', metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: 'ArrowRight', metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  it('lets Ctrl through to the shell on macOS', () => {
    expect(mapShortcut(key({ key: 'c', ctrlKey: true }), true)).toBeNull();
    expect(mapShortcut(key({ key: ']', ctrlKey: true }), true)).toBeNull();
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
});
