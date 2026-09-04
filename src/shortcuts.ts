import { TERMINAL_COUNT, type Direction } from './terminals';

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-pick' }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' }
  | { kind: 'terminal-move'; direction: Direction };

export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

// Option+H/J/K/L moves between panes. `code` because Option changes `key` on macOS ("h" becomes "˙").
const VIM_DIRECTIONS: Record<string, Direction> = { KeyH: 'left', KeyJ: 'down', KeyK: 'up', KeyL: 'right' };

export function mapShortcut(input: KeyInput, isMac: boolean): Action | null {
  if (input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey) {
    const direction = VIM_DIRECTIONS[input.code];
    return direction ? { kind: 'terminal-move', direction } : null;
  }

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
    case 'o': return { kind: 'project-pick' };
    case ']': return { kind: 'project-next' };
    case '[': return { kind: 'project-previous' };
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    default: return null;
  }
}
