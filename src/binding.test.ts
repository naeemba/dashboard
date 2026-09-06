import { describe, expect, it } from 'vitest';
import { formatBinding, keystrokeOf, matchesBinding, parseBinding } from './binding';
import { key } from './test-key';

describe('parseBinding', () => {
  it('reads a letter with modifiers', () => {
    expect(parseBinding('Ctrl+Shift+K'))
      .toEqual({ code: 'KeyK', ctrl: true, meta: false, alt: false, shift: true });
  });

  it('reads a bare letter, a digit, punctuation and a named key', () => {
    expect(parseBinding('D')?.code).toBe('KeyD');
    expect(parseBinding('1')?.code).toBe('Digit1');
    expect(parseBinding(']')?.code).toBe('BracketRight');
    expect(parseBinding('Left')?.code).toBe('ArrowLeft');
    expect(parseBinding('F5')?.code).toBe('F5');
  });

  it('does not care about case or spacing', () => {
    expect(parseBinding('ctrl+k')).toEqual(parseBinding('Ctrl+K'));
    expect(parseBinding(' cmd + left ')).toEqual(parseBinding('Cmd+Left'));
  });

  it('refuses what it cannot name', () => {
    expect(parseBinding('')).toBeNull();
    expect(parseBinding('Ctrl+')).toBeNull();
    expect(parseBinding('Hyper+K')).toBeNull();
    expect(parseBinding('Ctrl+Nonsense')).toBeNull();
  });
});

describe('formatBinding', () => {
  it('writes the canonical form, so a hand-edited file is tidied on the next write', () => {
    expect(formatBinding(parseBinding('ctrl+k')!)).toBe('Ctrl+K');
    expect(formatBinding(parseBinding('shift+alt+cmd+ctrl+1')!)).toBe('Ctrl+Cmd+Alt+Shift+1');
  });

  it('round-trips every form parseBinding accepts', () => {
    for (const text of ['Ctrl+K', 'D', '1', ']', 'Left', 'Shift+Tab', 'Cmd+Backspace', 'F12', 'Space']) {
      expect(formatBinding(parseBinding(text)!)).toBe(text);
    }
  });

  it('gives back nothing for a key it has no name for, so capture can refuse it', () => {
    expect(formatBinding({ code: 'IntlBackslash', ctrl: false, meta: false, alt: false, shift: false }))
      .toBeNull();
  });
});

describe('matchesBinding', () => {
  // The two lies event.key tells. Option+H arrives as "˙" on macOS and Shift+1 as "!";
  // the physical key is KeyH and Digit1 either way.
  it('matches the physical key, not the character the browser reported', () => {
    expect(matchesBinding(key({ code: 'KeyH', key: '˙', altKey: true }), 'Alt+H')).toBe(true);
    expect(matchesBinding(key({ code: 'Digit1', key: '!', shiftKey: true }), 'Shift+1')).toBe(true);
  });

  it('needs every modifier to agree', () => {
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), 'Ctrl+K')).toBe(true);
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true, shiftKey: true }), 'Ctrl+K')).toBe(false);
    expect(matchesBinding(key({ code: 'KeyK' }), 'Ctrl+K')).toBe(false);
  });

  it('never matches an unbound action or an unreadable binding', () => {
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), null)).toBe(false);
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), 'Hyper+K')).toBe(false);
  });
});

describe('keystrokeOf', () => {
  it('reads a keystroke off an event', () => {
    expect(keystrokeOf(key({ code: 'KeyK', ctrlKey: true, shiftKey: true })))
      .toEqual({ code: 'KeyK', ctrl: true, meta: false, alt: false, shift: true });
  });
});
