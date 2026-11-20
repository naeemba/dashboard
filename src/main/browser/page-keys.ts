// What `browser press <key>` sends the page: the key as Chromium's DevTools protocol takes it
// (Input.dispatchKeyEvent). `text` is what the key types, which is what makes Enter submit a form.

export type KeyEvent = { key: string; code: string; keyCode: number; text?: string };

const NAMED: Record<string, KeyEvent> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
};

export const KEY_NAMES = Object.values(NAMED).map((each) => each.code).join(', ');

// A key by its name, in any case (`Enter`, `arrowdown`, `Escape`), or one letter, digit or symbol.
export function keyEventOf(name: string): KeyEvent | null {
  const named = NAMED[name.toLowerCase()];
  if (named !== undefined) return named;
  if ([...name].length !== 1 || name.trim() === '') return null;
  const upper = name.toUpperCase();
  const letter = /^[A-Z]$/.test(upper);
  const digit = /^\d$/.test(name);
  return {
    key: name,
    code: letter ? `Key${upper}` : digit ? `Digit${name}` : '',
    keyCode: letter || digit ? upper.charCodeAt(0) : 0,
    text: name,
  };
}
