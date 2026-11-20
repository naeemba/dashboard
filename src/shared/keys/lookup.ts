import { ACTIONS, actionByName, type Action, type ActionEntry, type ActionScope } from './actions';
import { matchesBinding, type KeyInput } from './binding';
import { isSection } from '../manager/manager-sections';
import type { Mode } from './modes';
import type { Settings } from '../settings/settings';

// Which action a keystroke is, on which screen. Moved out of the renderer's shortcuts.ts, which
// re-exports it, so main asks the same lookup about a key pressed inside the browser view
// (browser-keys.ts): one table decides a key whether the window or a web page had it.

// `global` is heard on every screen, including while a shell has the keyboard. A scope named after a
// mode is heard only on that screen, which is what lets the board keep a bare D that a terminal never
// sees. `manager-page` is the exception that needs more than the mode: the manager shows four views
// and two of them — board and notes — are modes every project also has, so the page has to say
// whether it is the manager. The renderer knows — the manager is the page holding MANAGER_SLOT.
//
// `claude` is not a mode either: it is the main session's Claude screen, in the terminals view's left
// column, and its keys are heard while it holds the keyboard there, alongside the terminals keys.
//
// `ink` is the notes screen's handwriting page: heard in notes mode while that page, and not the text box,
// is the one showing. Which one that is belongs to the page, so the renderer says, as it does for chat.
export function hears(
  scope: ActionScope, mode: Mode, onManagerPage: boolean, chatFocused = false, inkShowing = false,
): boolean {
  if (scope === 'global') return true;
  if (scope === 'manager-page') return onManagerPage && isSection(mode);
  if (scope === 'claude') return chatFocused && mode === 'terminals';
  if (scope === 'ink') return inkShowing && mode === 'notes';
  return scope === mode;
}

// The Claude screen key that hides this terminals key while the screen has the keyboard: the two are
// heard together then, and where they share a key (Alt+O, Alt+N, Alt+J/K ship that way) the screen
// answers it. scopesOverlap says the two scopes never meet on purpose, or bindKey would unbind those
// shipped pairs. This is the one place the shadow is decided: the lookup skips the hidden key, the
// which-key strip leaves its row out, and the settings screen warns when a rebind makes a new one.
export function chatShadow(entry: ActionEntry, keys: Settings['keys']): ActionEntry | undefined {
  const binding = keys[entry.name] ?? null;
  if (entry.scope !== 'terminals' || binding === null) return undefined;
  return ACTIONS.find((other) => other.scope === 'claude' && keys[other.name] === binding);
}

// The other half of a shadow the named action is in: the Claude key hiding it, or the terminals key
// it hides. What the settings screen names after a rebind.
export function chatShadowPartner(name: string, keys: Settings['keys']): ActionEntry | undefined {
  const entry = actionByName(name);
  if (entry === undefined) return undefined;
  if (entry.scope === 'claude') return ACTIONS.find((other) => chatShadow(other, keys) === entry);
  return chatShadow(entry, keys);
}

// The key naming the mode you are already in belongs to whatever runs there: Ctrl+N completes a word
// in nvim, Ctrl+T transposes characters in the shell. You leave a mode by naming a different one.
// Asked about the action rather than the key, so it holds whatever the mode has been rebound to.
//
// Exported because shortcut-rows.ts asks it too, so the file that decides a key does nothing and the
// one row builder that prints both the help dialog's list and the which-key panel's cannot come to
// disagree about which keys those are.
export function passesThrough(entry: ActionEntry, mode: Mode): boolean {
  return entry.action.kind === 'mode-set' && entry.action.mode === mode;
}

export function mapShortcut(
  input: KeyInput,
  keys: Settings['keys'],
  mode: Mode = 'terminals',
  onManagerPage = false,
  chatFocused = false,
  inkShowing = false,
): Action | null {
  for (const entry of ACTIONS) {
    if (!hears(entry.scope, mode, onManagerPage, chatFocused, inkShowing)) continue;
    if (chatFocused && chatShadow(entry, keys) !== undefined) continue;
    if (!matchesBinding(input, keys[entry.name] ?? null)) continue;
    if (passesThrough(entry, mode)) return null;
    return entry.action;
  }
  // The table order decides a tie. Two actions can only share a key if the file was hand-edited into
  // it — bindKey never leaves two on one — and then the first row wins rather than both firing.
  return null;
}
