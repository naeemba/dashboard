import { TERMINAL_COUNT } from './terminals';

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' };

export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

export function mapShortcut(input: KeyInput, isMac: boolean): Action | null {
  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (!modifier || input.altKey) return null;

  // Digits use `code` because Shift changes `key` ("1" becomes "!").
  const digit = /^Digit([1-9])$/.exec(input.code);
  if (digit) {
    const index = Number(digit[1]) - 1;
    if (input.shiftKey) return { kind: 'project-jump', index };
    return index < TERMINAL_COUNT ? { kind: 'terminal-focus', index } : null;
  }

  if (input.shiftKey) return null;
  switch (input.key) {
    case ']': return { kind: 'project-next' };
    case '[': return { kind: 'project-previous' };
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    default: return null;
  }
}
