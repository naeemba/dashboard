# Keys

Every shortcut is a row in one table, `ACTIONS`: the window's lookup, the
help dialog (Ctrl+H), the settings screen and the which-key strip all read it.
A project's views are `PROJECT_MODES`, one mode key each.

## Files

Folders: `src/shared/keys/`, `src/renderer/keys/`.

- Table and modes: `actions.ts`, `modes.ts`
- Keystrokes: `binding.ts`, `shortcuts.ts`, `keycaps.ts`, `test-key.ts`
- Help and strip: `help.ts`, `shortcut-rows.ts`, `which-key.ts`,
  `which-key-view.ts`, `which-key.css`

## Scenarios

- Given you are in nvim, when you press the nvim mode key, then nvim gets the keystroke.
- Given a dialog reads `event.key`, when Ctrl is held, then the dialog ignores the key.
- Given any screen, when you press Ctrl+H, then it lists the keys that screen hears and a blurb saying what it is.
- Given you hold Ctrl, Cmd or Alt, when no key follows, then the strip names every key that modifier can still start.
- Given you rebind a mode key, when you press the new key in that mode, then it passes through to the pane.
