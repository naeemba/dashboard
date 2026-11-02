# Keys

Every shortcut is a row in one table, `ACTIONS`: the window's lookup, the
help dialog (Ctrl+H), the settings screen and the which-key strip all read it.
A project's views are `PROJECT_MODES`, one mode key each.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

### Modes

A project is shown five ways and remembers which one you left it on, so jumping
to it lands you back in the same view. The five are named along the foot of a
project's page, the one you are on lit, and a click on a name goes there the way
its key does. The manager has five sections of its own, named along the top: its
list of what the panes want, a board of its own above every project's, one
command run across projects, a page of notes about none of them, and what the
app itself has been doing. Two of the five mode keys land on a section rather
than doing nothing there — the board key and the notes key.

## Files

Folders: `src/shared/keys/`, `src/renderer/keys/`.

- Table and modes: `actions.ts`, `modes.ts`
- Keystrokes: `binding.ts`, `shortcuts.ts`, `keycaps.ts`, `test-key.ts`
- Help and strip: `help.ts`, `shortcut-rows.ts`, `which-key.ts`,
  `which-key-view.ts`, `which-key-tracking.ts`, `which-key.css`

## Scenarios

- Given you are in nvim, when you press the nvim mode key, then nvim gets the keystroke.
- Given a dialog reads `event.key`, when Ctrl is held, then the dialog ignores the key.
- Given any screen, when you press Ctrl+H, then it lists the keys that screen hears and a blurb of at most 60 words saying what it is.
- Given you hold Ctrl, Cmd or Alt, when no key follows, then the strip names every key that modifier can still start.
- Given you rebind a mode key, when you press the new key in that mode, then it passes through to the pane.
