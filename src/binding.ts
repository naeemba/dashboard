// What every key handler is given: the browser's KeyboardEvent narrowed to the six fields anything
// here reads. Lived in shortcuts.ts until bindings needed it, and shortcuts.ts still re-exports it.
export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

// A keystroke is the key under your finger plus the modifiers held with it. `code`, never `key`:
// hold Option on macOS and `h` arrives as "˙", hold Shift and `1` arrives as "!". The physical key
// is the same either way, so it is the only thing a binding can be matched against honestly.
export type Keystroke = { code: string; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean };

// The keys a binding may name, written the way a person writes them. Letters and digits are spelled
// as themselves; everything else needs a name because `Slash` is not what anyone would type.
const NAMED_KEYS: Record<string, string> = {
  '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', '.': 'Period', '/': 'Slash',
  ';': 'Semicolon', "'": 'Quote', '-': 'Minus', '=': 'Equal', '`': 'Backquote',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown',
  TAB: 'Tab', ENTER: 'Enter', ESCAPE: 'Escape', BACKSPACE: 'Backspace', SPACE: 'Space',
};

// Written out rather than derived, so formatting is a lookup in the other direction and a key with no
// written form has none in either — which is what lets the settings screen refuse to bind it.
const KEY_NAMES = new Map<string, string>(Object.entries(NAMED_KEYS).map(
  ([name, code]) => [code, name.length === 1 ? name : name.charAt(0) + name.slice(1).toLowerCase()],
));

function codeOfName(name: string): string | null {
  const upper = name.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
  if (/^[0-9]$/.test(upper)) return `Digit${upper}`;
  if (/^F([1-9]|1[0-2])$/.test(upper)) return upper;
  return NAMED_KEYS[upper] ?? NAMED_KEYS[name] ?? null;
}

function nameOfCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return KEY_NAMES.get(code) ?? null;
}

// Ctrl, Cmd, Alt, Shift, always in that order. One order means the file, the settings screen and the
// help dialog all spell a key the same way, and a hand-edited `shift+ctrl+k` is tidied on the next write.
const MODIFIERS = ['Ctrl', 'Cmd', 'Alt', 'Shift'] as const;

export function parseBinding(text: string): Keystroke | null {
  const parts = text.split('+').map((part) => part.trim()).filter((part) => part !== '');
  // A lone "+" splits to nothing, and "Ctrl+" to one part that is a modifier with no key after it.
  if (parts.length === 0) return null;
  const keystroke: Keystroke = { code: '', ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts.slice(0, -1)) {
    switch (part.toLowerCase()) {
      case 'ctrl': keystroke.ctrl = true; break;
      case 'cmd': keystroke.meta = true; break;
      case 'alt': keystroke.alt = true; break;
      case 'shift': keystroke.shift = true; break;
      // A modifier this file does not know is not a binding. Guessing would give you a shortcut that
      // silently never fires.
      default: return null;
    }
  }
  const code = codeOfName(parts[parts.length - 1]);
  return code === null ? null : { ...keystroke, code };
}

// Null for a key with no written form — a media key, a keyboard's own extra button. The settings
// screen turns that into a refusal rather than storing a binding nobody could read or type back.
export function formatBinding(keystroke: Keystroke): string | null {
  const name = nameOfCode(keystroke.code);
  if (name === null) return null;
  const held = [keystroke.ctrl, keystroke.meta, keystroke.alt, keystroke.shift];
  return [...MODIFIERS.filter((_modifier, index) => held[index]), name].join('+');
}

export function keystrokeOf(input: KeyInput): Keystroke {
  return {
    code: input.code,
    ctrl: input.ctrlKey,
    meta: input.metaKey,
    alt: input.altKey,
    shift: input.shiftKey,
  };
}

// Null is an action with no key, which nothing may match. So is a binding that cannot be read: a typo
// in the file costs you that one shortcut rather than binding it to something arbitrary.
export function matchesBinding(input: KeyInput, binding: string | null): boolean {
  if (binding === null) return false;
  const wanted = parseBinding(binding);
  if (wanted === null) return false;
  const pressed = keystrokeOf(input);
  return wanted.code === pressed.code
    && wanted.ctrl === pressed.ctrl && wanted.meta === pressed.meta
    && wanted.alt === pressed.alt && wanted.shift === pressed.shift;
}
