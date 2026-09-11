import { ACTIONS, type Action, type ActionScope } from './actions';
import { matchesBinding, type KeyInput } from './binding';
import { isSection } from './manager-sections';
import type { Mode } from './modes';
import type { Settings } from './settings';

export type { KeyInput, Action };

// What every keydown handler asks before it acts on `event.key`. A key with a modifier held is on its
// way to whoever owns that combination, so a handler that reads `event.key` without asking this first
// steals it. Dialogs included. CLAUDE.md holds the list of handlers that ask, and the few deliberate
// exceptions.
export function isModified(input: KeyInput): boolean {
  return input.shiftKey || stopsTyping(input);
}

// The three modifiers that turn a keystroke into somebody's shortcut instead of a character. Shift is
// not one of them, which is the only difference between the two predicates either side of this — so
// they are written as one list, and a fourth modifier added here reaches both.
function stopsTyping(input: KeyInput): boolean {
  return input.metaKey || input.ctrlKey || input.altKey;
}

// Whether the keystroke is a character somebody typed rather than a key with a name. Every key that
// does something has a name — Enter, Escape, Tab, the arrows — and `key` is longer than one character
// for all of them, so what is left is the letter, digit or symbol itself.
// Asked where a keystroke is passed on to something that will act on it: a name sent to a shell is a
// command it runs, so `yes` typed at a pane that has stopped asking starts a process printing y until
// you go and find it.
// Shift is the one modifier that counts as typing — it is how you write a capital, and `key` is
// already the capital — so an agent asking `Continue? [Y/n]` can be answered the way it asks. The
// other three are not typing, and anything actually bound to one of them was claimed by the window's
// lookup before this is asked.
export function isBareCharacter(input: KeyInput): boolean {
  return !stopsTyping(input) && input.key.length === 1;
}

// `global` is heard on every screen, including while a shell has the keyboard. A scope named after a
// mode is heard only on that screen, which is what lets the board keep a bare D that a terminal never
// sees. `manager-page` is the exception that needs more than the mode: the manager shows three views
// and one of them is board mode, which every project also has, so the page has to say whether it is
// the manager. The renderer knows — the manager is the page holding MANAGER_SLOT.
export function hears(scope: ActionScope, mode: Mode, onManagerPage: boolean): boolean {
  if (scope === 'global') return true;
  if (scope === 'manager-page') return onManagerPage && isSection(mode);
  return scope === mode;
}

export function mapShortcut(
  input: KeyInput,
  keys: Settings['keys'],
  mode: Mode = 'terminals',
  onManagerPage = false,
): Action | null {
  for (const entry of ACTIONS) {
    if (!hears(entry.scope, mode, onManagerPage)) continue;
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
