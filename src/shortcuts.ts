import { MODE_KEYS, type Mode } from './modes';
import { TERMINAL_COUNT, type Direction } from './terminals';

export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-move'; index: number }
  | { kind: 'project-picker' }
  | { kind: 'project-last' }
  | { kind: 'help' }
  | { kind: 'mode-set'; mode: Mode }
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

// Where every keydown handler in the app starts. A key with a modifier held is on its way to whoever
// owns that combination — Ctrl+N is the mode key, not `n` — so a handler that reads `event.key`
// without asking this first steals it. Dialogs included: they are the two that got it wrong.
export function isModified(input: KeyInput): boolean {
  return input.shiftKey || input.metaKey || input.ctrlKey || input.altKey;
}

// Option+H/J/K/L moves between panes. `code` because Option changes `key` on macOS ("h" becomes "˙").
const VIM_DIRECTIONS: Record<string, Direction> = { KeyH: 'left', KeyJ: 'down', KeyK: 'up', KeyL: 'right' };

// 1..9 count from zero here. `code`, not `key`: Shift turns "1" into "!", and a layout can move the
// character but not the number row. Zero is not a project or a terminal, so it has no index.
function digitIndex(code: string): number | null {
  const digit = /^Digit([1-9])$/.exec(code);
  return digit ? Number(digit[1]) - 1 : null;
}

// Keys that address a pane. They only mean something while panes are on screen: in nvim and board mode
// there is no grid to focus into and nothing to move between.
function paneShortcut(input: KeyInput, isMac: boolean): Action | null {
  if (input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey) {
    const direction = VIM_DIRECTIONS[input.code];
    return direction ? { kind: 'terminal-move', direction } : null;
  }

  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (!modifier || input.altKey || input.shiftKey) return null;

  const terminal = digitIndex(input.code);
  if (terminal !== null) return terminal < TERMINAL_COUNT ? { kind: 'terminal-focus', index: terminal } : null;

  // `key`, not `code`, so the arrows and brackets follow the character on Dvorak and Colemak.
  switch (input.key) {
    case 'ArrowRight': return { kind: 'terminal-next' };
    case 'ArrowLeft': return { kind: 'terminal-previous' };
    // Ghostty sends Ctrl+U for Cmd+Backspace, so the shell clears the line — zsh binds ^U to
    // kill-whole-line, so anything after the cursor goes too. xterm.js sends a plain backspace,
    // which eats one character. Elsewhere Ctrl+U already reaches the shell on its own, so there is
    // nothing to stand in for.
    case 'Backspace': return isMac ? { kind: 'terminal-input', data: '\x15' } : null;
    default: return null;
  }
}

export function mapShortcut(input: KeyInput, isMac: boolean, mode: Mode = 'terminals'): Action | null {
  // Everything about projects and modes is plain Ctrl on every platform, macOS included, so the set
  // stays one gesture. The shell never sees these: no XOFF, no emacs reverse search, no readline
  // operate-and-get-next. An uppercase letter is Caps Lock, which does not set shiftKey.
  if (input.ctrlKey && !input.metaKey && !input.altKey) {
    const project = digitIndex(input.code);
    if (project !== null) {
      return input.shiftKey ? { kind: 'project-move', index: project } : { kind: 'project-jump', index: project };
    }
    if (input.shiftKey) return null;
    const letter = input.key.toLowerCase();
    if (letter === 's') return { kind: 'project-picker' };
    if (letter === 'o') return { kind: 'project-last' };
    // Answers from every mode, because the screen you cannot remember the keys for is the one you are
    // on. The cost is that Ctrl+H no longer reaches the shell or nvim as a backspace.
    if (letter === 'h') return { kind: 'help' };
    const wanted = MODE_KEYS[letter];
    // The key naming the mode you are already in belongs to whatever runs there. Ctrl+N completes a
    // word in nvim and Ctrl+T transposes characters in the shell; taking those would cost more than
    // the shortcut is worth. You leave a mode by naming a different one.
    if (wanted !== undefined) return wanted === mode ? null : { kind: 'mode-set', mode: wanted };
  }

  // Cycling projects answers from every mode, so a board is never a dead end.
  const modifier = isMac ? input.metaKey : input.ctrlKey;
  if (modifier && !input.altKey && !input.shiftKey) {
    if (input.key === ']') return { kind: 'project-next' };
    if (input.key === '[') return { kind: 'project-previous' };
  }

  return mode === 'terminals' ? paneShortcut(input, isMac) : null;
}
