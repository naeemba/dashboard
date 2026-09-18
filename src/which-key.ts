import type { ActionEntry } from './actions';
import { formatBinding, parseBinding, type KeyInput, type Keystroke } from './binding';
import type { Mode } from './modes';
import type { Settings } from './settings';
import { shortcutRows, type Shortcut } from './shortcut-rows';
import { hears, stopsTyping } from './shortcuts';

// The modifiers under your fingers with no key pressed yet. A binding is a Keystroke — these four and
// the key — so this is that same thing half-typed, which is what lets one comparison answer "could the
// binding still be what you are reaching for".
export type Held = Omit<Keystroke, 'code'>;

// The keys that are nothing but a modifier. Holding one is the whole gesture this answers: you press
// Ctrl, nothing has happened, and the app says what Ctrl can start from where you are.
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);

// Null for a keystroke that is not a modifier held on its own, which is the strip's cue to go away:
// the key you pressed is on its way to whoever owns it, and the question has been answered.
//
// Null for Shift held alone as well, though Shift is a modifier and the board does bind Shift with an
// arrow. `stopsTyping` is the list of the three that are not typing, kept in shortcuts.ts and asked
// here rather than written out again — Shift is how you write a capital, so a strip that opened on it
// would open every time you typed one, on the manager mid-answer to `Continue? [Y/n]`.
//
// Read on release too, and the same answer is the right one: let go of Shift while Ctrl is still down
// and this says Ctrl, so the list widens back out rather than disappearing.
export function heldPrefix(input: KeyInput): Held | null {
  if (!MODIFIER_KEYS.has(input.key) || !stopsTyping(input)) return null;
  return { ctrl: input.ctrlKey, meta: input.metaKey, alt: input.altKey, shift: input.shiftKey };
}

// Whether the binding is still reachable from what you are holding. Every modifier you hold has to be
// one the binding wants; a modifier the binding wants and you are not holding yet is the rest of the
// gesture, and is what the row tells you to press.
//
// A subset, where matchesBinding asks for equality — which is the whole difference between "this key
// fires now" and "this key is still ahead of you".
function covers(held: Held, binding: Keystroke): boolean {
  return (!held.ctrl || binding.ctrl) && (!held.meta || binding.meta)
    && (!held.alt || binding.alt) && (!held.shift || binding.shift);
}

// What is left to press, written the way the help dialog and the settings screen write a key. Holding
// Ctrl, the row for Ctrl+Shift+N reads `Shift+N` — the strip answers "and then what", not "the key is
// called this", so repeating the modifier already under your finger down forty rows is noise.
function rest(entry: ActionEntry, held: Held, keys: Settings['keys']): string | null {
  const keystroke = parseBinding(keys[entry.name] ?? '');
  if (keystroke === null || !covers(held, keystroke)) return null;
  return formatBinding({
    code: keystroke.code,
    ctrl: keystroke.ctrl && !held.ctrl, meta: keystroke.meta && !held.meta,
    alt: keystroke.alt && !held.alt, shift: keystroke.shift && !held.shift,
  });
}

// Every key the modifiers you are holding can still reach, on the screen you are on. `hears` is the
// same question the window's lookup asks before it fires a key, asked here so the strip never offers
// one that would do nothing: the board's bare D is not on this list while you hold Ctrl, and the
// manager's section keys are not on it from a project's own board.
//
// The rows themselves are built where the help dialog's are, so the two lists cannot come to disagree
// about when a numbered run may print as a range, or about what a passed-through key says.
export function whichKeyRows(
  held: Held, keys: Settings['keys'], mode: Mode, onManagerPage: boolean, isMac: boolean,
): Shortcut[] {
  return shortcutRows({
    wants: (entry) => hears(entry.scope, mode, onManagerPage),
    label: (entry) => rest(entry, held, keys),
    mode,
    keys,
    isMac,
  });
}
