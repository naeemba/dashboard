# Notes

One page of free text per project, beside the board in `.dashboard/`, and one
for the manager page kept in the home directory.

## Files

- `notes-state.ts`, `notes-store.ts`, `notes-view.ts`

## Scenarios

- Given a project's notes, when you stop typing, then the page is written to the project's `.dashboard` folder.
- Given the notes file has not been read yet, when the box is still empty, then nothing is written over the file.
- Given the notes box, when you press Tab, then it is the one key the screen reads and focus stays in the box.
- Given the manager page, when you open its notes, then they are kept in the home directory, not in a project.

## Open questions

- `notes-view.ts` still prints `String(error)` (errors-rule-1).
