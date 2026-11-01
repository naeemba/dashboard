# Settings

One file, one table, one screen: `settings.json` beside the `.env` main reads,
holding the key bindings, font size and shell, and edited from the settings
screen where a row is armed and the next keystroke becomes its key.

## Files

Folders: `src/main/settings/`, `src/shared/settings/`, `src/renderer/settings/`.

- `settings.ts`, `settings-store.ts`, `settings-rows.ts`, `settings-view.ts`

## Scenarios

- Given a row is armed, when you press a key with modifiers, then that keystroke becomes the binding.
- Given a setting left at its shipped default, when the file is saved, then the line is left out.
- Given an old file holding a shipped default, when the app launches, then the launch tidy removes the line.
- Given a font size the screen accepts, when the file is read back, then the same range check keeps it (errors-decision-1).
