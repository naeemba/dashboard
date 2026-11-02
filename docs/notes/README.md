# Notes

One page of free text per project, beside the board in `.dashboard/`, and one
for the manager page kept in the home directory.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

One page of free text, kept in .dashboard/notes.md. On a project that folder is
the project's own, beside the board, so the page commits or is ignored with
everything else the dashboard keeps about that project. The manager has a page
too, and it is about no project, so it goes in a .dashboard folder in your home
directory instead — out of every repository, where a note about none of them
cannot be committed to one of them by accident.

Either way it is for what is not a card: the command you can never remember,
what the staging password is, where you had got to on Friday.

There is no save key. What you type is written a moment after you stop typing,
wherever you are by then — nothing runs when you leave, the wait simply finishes
on its own. Arriving writes anything still waiting before it reads, so switching
away and straight back shows what you just wrote rather than the page from
before it.

A write that did not land leaves the box holding a sentence the file never took,
and arriving keeps it rather than reading the older page over it, however long
ago that write went out.

Arriving is also the only time the file is read. An edit made in a pane — or by
an agent working in the project — shows up when you next come here; while you
are sitting on this screen the box you are typing in is what gets written, and
it wins.

If that read fails the status bar says so, and nothing is written from then on:
a box you were never shown the file in must not be saved over it. Type into it
anyway and no later arrival reads either — reading now would take what you typed
off the screen. The bar says so on every arrival, and it names the way back:
copy the text out, then make the box match the file again — empty it where
nothing was ever read, or undo back to the page that was there — and the next
arrival reads. Either way the file is exactly as it was.

It is a plain box and nothing more: nothing parses the markdown and nothing
renders it. The name is there so the file is worth opening in an editor or
reading on a forge.

This screen has no keys of its own — everything that is not one of the keys
below is a character in the box. Tab is the one thing it stops: the box is the
whole screen, so Tab would take the keyboard somewhere you cannot see, and it
does nothing here instead.

## Files

Folders: `src/main/notes/`, `src/renderer/notes/`.

- `notes-state.ts`, `notes-store.ts`, `notes-view.ts`

## Scenarios

- Given a project's notes, when you stop typing, then the page is written to the project's `.dashboard` folder.
- Given the notes file has not been read yet, when the box is still empty, then nothing is written over the file.
- Given the notes box, when you press Tab, then it is the one key the screen reads and focus stays in the box.
- Given the manager page, when you open its notes, then they are kept in the home directory, not in a project.

## Open questions

- `notes-view.ts` still prints `String(error)` (errors-rule-1).
