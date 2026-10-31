# Keys: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## keys-rule-1: Mode keys pass through

The four mode keys switch modes, except when they name the mode you are already
in. There they are ignored and the pane gets the keystroke. Ctrl+N is nvim's
autocomplete and Ctrl+T is the shell's transpose; take them and Ctrl+N mid-word
throws you out to the terminal grid instead of completing the word. You leave a
mode by naming a different one.

Inside an overlay the key goes nowhere — a dialog has focus, so no pane can
receive it.

**Every dialog that reads `event.key` for itself must check `if
(isModified(event)) return;` first.** Take Ctrl+N in the card detail dialog and
pressing it mid-word opens a "Subtask title" box. Take Cmd+Enter in the delete
confirmation and a stray keystroke deletes a card and its whole family. Both
happened before this was written down.

The manager list asks `isBareCharacter` instead, because it takes Shift on
purpose. Both predicates read the same list of modifiers that are not typing, so
a fourth added to `stopsTyping` reaches both.

The window listener in `renderer.ts` never needed the guard: it does not read
`event.key`, it hands the whole keystroke to `mapShortcut`, which matches every
modifier exactly. A plain `Tab` binding cannot match `Ctrl+Tab`.

These exceptions read a key before the guard, all on purpose:

- Tab, in a search box — the project picker's, the board's card search and the
  Claude screen's /resume conversation picker, which are one dialog in
  `searchOverlay` — and in the board's filter dialog. Nothing
  else there is focusable, so Tab would drop focus into the pane behind the
  overlay.
- Tab, in the notes box, for the same reason one screen out. It is the only key
  that screen reads.
- Every key, in the settings screen, while a row is armed — or Ctrl, Cmd, Alt
  and Shift are the only keys you could never bind. One keystroke long, guard
  back immediately after.
- Shift, on the manager list. Refusing it refuses the `Y` in `Continue? [Y/n]`.

If a handler reads a modified key anywhere else, it is stealing it.

A new project view is a row in `PROJECT_MODES`, a row in `ACTIONS`, a view built
in `page.ts`, a branch in `focusMode`, a branch in `modeLabel`, and a name and
blurb in `src/help.ts`.

## keys-rule-2: The help dialog is part of the change

**Every task that adds, removes or changes a key, a mode, or what a screen does
updates `src/help.ts` in the same change.** Ctrl+H is where anyone finds out what
this app can do; a dialog describing the version before yours is worse than no
dialog, because it is believed.

- The keys. Every row prints from the one table in `src/actions.ts`, so adding a
  shortcut means adding a row there and nothing else — the handler, the help
  dialog, the settings screen and the which-key strip all read it.
- The blurb. Each section opens with a sentence saying what that screen is. If a
  task changes what a screen does, the blurb is stale too.

A change is not done until Ctrl+H would tell the truth about it.

Three board-scope keys and Ctrl+Q are listed on screens where they do nothing.
That is settled — see keys-decision-1 and keys-decision-2 before changing it.
