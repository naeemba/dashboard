import { ACTIONS, type Action, type ActionScope } from './actions';
import { matchesBinding, type KeyInput } from './binding';
import type { Mode } from './modes';
import type { Settings } from './settings';

export type { KeyInput, Action };

// What every keydown handler asks before it acts on `event.key`. A key with a modifier held is on its
// way to whoever owns that combination, so a handler that reads `event.key` without asking this first
// steals it. Dialogs included. The single deliberate exception is the armed row in the settings
// screen, which exists to read exactly these keys; CLAUDE.md names it.
export function isModified(input: KeyInput): boolean {
  return input.shiftKey || input.metaKey || input.ctrlKey || input.altKey;
}

// Whether the keystroke is a character somebody typed rather than a key with a name. Every key that
// does something has a name — Enter, Escape, Tab, the arrows — and `key` is longer than one character
// for all of them, so what is left is the letter, digit or symbol itself.
// Asked where a keystroke is passed on to something that will act on it: a name sent to a shell is a
// command it runs, so `yes` typed at a pane that has stopped asking starts a process printing y until
// you go and find it.
export function isBareCharacter(input: KeyInput): boolean {
  return !isModified(input) && input.key.length === 1;
}

// `global` is heard on every screen, including while a shell has the keyboard. The other two are heard
// only on their own, which is what lets the board keep a bare D that a terminal never sees.
export function hears(scope: ActionScope, mode: Mode): boolean {
  return scope === 'global' || scope === mode;
}

export function mapShortcut(
  input: KeyInput,
  keys: Settings['keys'],
  mode: Mode = 'terminals',
): Action | null {
  for (const entry of ACTIONS) {
    if (!hears(entry.scope, mode)) continue;
    if (!matchesBinding(input, keys[entry.name] ?? null)) continue;
    // The key naming the mode you are already in belongs to whatever runs there: Ctrl+N completes a
    // word in nvim, Ctrl+T transposes characters in the shell. You leave a mode by naming a different
    // one. Checked on the action rather than the key, so it holds whatever the mode has been rebound to.
    if (entry.action.kind === 'mode-set' && entry.action.mode === mode) return null;
    return entry.action;
  }
  // The table order decides a tie. Two actions can only share a key if the file was hand-edited into
  // it — bindKey never leaves two on one — and then the first row wins rather than both firing.
  return null;
}
