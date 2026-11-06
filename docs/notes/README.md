# Notes

Two pages per project, beside the board in `.dashboard/`: free text, and
handwriting. The manager page has the same two, kept in the home directory.

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

This page has no keys of its own — everything that is not one of the app's own
keys is a character in the box. Tab is the one thing it stops: the box is the
whole screen, so Tab would take the keyboard somewhere you cannot see, and it
does nothing here instead.

### The handwriting page

The notes screen has a second page, where you write by hand with a mouse, a pen
or a finger. Ctrl+Shift+H turns between the two, on a project and on the
manager's notes alike, and each page remembers which one you left it on until
the app closes; it starts on the text. The text page is exactly as above.

The page is kept in .dashboard/notes-ink.svg, beside notes.md and in the same
folder for the same reason. It is a real SVG: open it in a browser or on a forge
and the page is there, in black. The strokes' own points ride along in the file
too, so the page can be opened again here and drawn on.

Drawing is pointer input, the way typing is keys; everything around it is a key,
heard only while this page is showing. P is the pen and E the eraser, which
removes a whole stroke it is dragged across — one drag is one step. C is the next
colour (the theme's text colour, red, blue, green) and W the next width. Z undoes
the last stroke, erase or clear, and Shift+X clears the page; undo brings it
back. Undo survives leaving the page and coming back; it starts again only when
another screen changed the file, so you cannot undo past what someone else wrote. A pen's pressure changes the
width of the line, and the eraser end of a pen erases whichever tool is picked.
A mouse and a finger draw at the chosen width.

The page scrolls, and always has a screen of room below the lowest stroke. It
is as wide as its ink, so a page written on a wide window scrolls sideways on a
narrow one. The strip names the keys as they are bound now.

It is written a moment after a stroke ends, read only on arrival and guarded the
way the text page is: a page never read is never written over, and a file this
page cannot read — one edited by hand, or drawn by something else — is treated
as a failed read. The bar says so, nothing is written, and the file is exactly as
it was.

## Files

Folders: `src/main/notes/`, `src/renderer/notes/`.

- `notes-state.ts`, `notes-store.ts`, `notes-view.ts`
- `ink-store.ts` (main): the .dashboard/notes-ink.svg file, as an opaque string
- `ink-view.ts`: the handwriting page, its pointer input and its saving
- `ink-svg.ts`: the file's format, written and read
- `ink-geometry.ts`: a stroke's outline and whether the eraser touches it
- `ink-history.ts`: strokes and the undo steps
- `ink-pointer.ts`: what a press of a pointer means — draw, erase or nothing
- `notes-wiring.ts`: either page's file written elsewhere, re-read on the page showing
- `saved-page.ts`: the wait, the flush and the read and write rules both pages share

## Scenarios

- Given a project's notes, when you stop typing, then the page is written to the project's `.dashboard` folder.
- Given the notes file has not been read yet, when the box is still empty, then nothing is written over the file.
- Given the notes box, when you press Tab, then it is the one key the screen reads and focus stays in the box.
- Given the manager page, when you open its notes, then they are kept in the home directory, not in a project.
- Given the text page, when you press Ctrl+Shift+H, then the handwriting page shows and has the keyboard, and pressing it again returns to the text.
- Given the handwriting page, when you draw with the pen and stop, then the page is written to .dashboard/notes-ink.svg a moment later.
- Given a drag of the eraser across three strokes, when you press Z, then all three come back.
- Given you cleared the page, when you press Z, then the page is back.
- Given you cleared the page and toggled to the text and back, when you press Z, then the page is back.
- Given a notes-ink.svg this page cannot read, when you arrive and draw, then the file is never written over and the status bar says it was not read.

## Open questions

None.
