import { TERMINAL_COUNT, type Direction } from './terminals';

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-move'; index: number }
  | { kind: 'project-picker' }
  | { kind: 'project-last' }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' }
  | { kind: 'terminal-move'; direction: Direction }
  | { kind: 'terminal-input'; data: string };

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

// 1..9 count from zero here. `code`, not `key`: Shift turns "1" into "!", and a layout can move the
// character but not the number row. Zero is not a project or a terminal, so it has no index.
function digitIndex(code: string): number | null {
  const digit = /^Digit([1-9])$/.exec(code);
  return digit ? Number(digit[1]) - 1 : null;
}

export function mapShortcut(input: KeyInput, isMac: boolean): Action | null {
  // Everything about projects is plain Ctrl on every platform, macOS included, so the set stays one
  // gesture. The shell never sees these: no XOFF, no emacs reverse search, no readline
  // operate-and-get-next. An uppercase letter is Caps Lock, which does not set shiftKey.
  if (input.ctrlKey && !input.metaKey && !input.altKey) {
    const project = digitIndex(input.code);
    if (project !== null) {
      return input.shiftKey ? { kind: 'project-move', index: project } : { kind: 'project-jump', index: project };
    }
    if (input.shiftKey) return null;
    if (input.key === 's' || input.key === 'S') return { kind: 'project-picker' };
    if (input.key === 'o' || input.key === 'O') return { kind: 'project-last' };
  }

  if (input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey) {
    const direction = VIM_DIRECTIONS[input.code];
    return direction ? { kind: 'terminal-move', direction } : null;
  }

  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (!modifier || input.altKey) return null;

  if (input.shiftKey) return null;
  const terminal = digitIndex(input.code);
  if (terminal !== null) return terminal < TERMINAL_COUNT ? { kind: 'terminal-focus', index: terminal } : null;

  // `key`, not `code`, so the brackets follow the character on Dvorak and Colemak.
  switch (input.key) {
    case ']': return { kind: 'project-next' };
    case '[': return { kind: 'project-previous' };
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    // Ghostty sends Ctrl+U for Cmd+Backspace, so the shell erases back to the start of the line;
    // xterm.js sends a plain backspace, which eats one character. Elsewhere Ctrl+U already reaches
    // the shell on its own, so there is nothing to stand in for.
    case 'Backspace': return isMac ? { kind: 'terminal-input', data: '\x15' } : null;
    default: return null;
  }
}
