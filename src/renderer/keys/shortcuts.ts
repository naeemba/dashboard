import type { Action } from '../../shared/keys/actions';
import type { KeyInput } from '../../shared/keys/binding';

export type { Action };
// The screen-by-screen lookup lives in src/shared so main asks it too; lookup.ts says why.
export { chatShadow, chatShadowPartner, hears, mapShortcut, passesThrough } from '../../shared/keys/lookup';

// What every keydown handler asks before it acts on `event.key`. A key with a modifier held is on its
// way to whoever owns that combination, so a handler that reads `event.key` without asking this first
// steals it. Dialogs included. key-modifiers.test.ts holds every handler to it, and lists the few
// deliberate exceptions.
export function isModified(input: KeyInput): boolean {
  return input.shiftKey || stopsTyping(input);
}

// A button the keyboard walked to with Tab presses itself on a bare Enter or Space, the way every
// button does, instead of the key going to the screen behind it — on the manager, Enter would open the
// selected row. A button focused by a click is not walked to: the browser does not draw it as
// :focus-visible, so a click never takes Enter away from the screen.
export function pressesWalkedToButton(input: KeyInput, walkedToButton: boolean): boolean {
  return walkedToButton && !isModified(input) && (input.key === 'Enter' || input.key === ' ');
}

// The three modifiers that turn a keystroke into somebody's shortcut instead of a character. Shift is
// not one of them, which is the only difference between the two predicates either side of this — so
// they are written as one list, and a fourth modifier added here reaches both.
//
// Each is written twice over: the flag it sets on a keystroke, and the name its own key arrives under.
// One list all the same, because the two readers want different halves of it — the dialogs read the
// flags, and the which-key strip has to recognise the key you pressed by name. Add a fourth here and
// the strip answers to it the same day the dialogs start refusing it.
const NOT_TYPING: Record<string, (input: KeyInput) => boolean> = {
  Control: (input) => input.ctrlKey,
  Meta: (input) => input.metaKey,
  Alt: (input) => input.altKey,
};

export function stopsTyping(input: KeyInput): boolean {
  return Object.values(NOT_TYPING).some((isHeld) => isHeld(input));
}

// Whether the key is a modifier and nothing else, which is the which-key strip's cue. Shift counts
// here and not above: holding it is typing a capital, but letting go of it while Ctrl is still down is
// still a question about Ctrl, and the strip has to hear that release to widen back out.
export function isModifierKey(key: string): boolean {
  return key === 'Shift' || Object.hasOwn(NOT_TYPING, key);
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

