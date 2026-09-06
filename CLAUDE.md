# dashboard

Electron terminal dashboard. Each project is a page of five shells.

## Never rebuild or restart the running app — Hard Rule

**Do not quit, kill, restart, or replace the Dashboard app running on this machine
unless I ask for it in that same conversation.** No `npm run package` into
/Applications, no `osascript ... quit`, no `pkill`, no `open -a Dashboard`.

Restarting kills every shell inside it. There are long-running tasks in those
panes; when the app dies, so does the work, with no way to get it back. The quit
also fires node-pty's exit callback during teardown, so it surfaces as a SIGABRT
crash report and looks like the app broke.

After changing code: run the tests, say the installed app needs a rebuild and
restart to pick the change up, and stop there. Building into `out/` or `.vite/`
is fine — nothing is running from those.

## Keyboard first — Hard Rule

Every action must be reachable from the keyboard alone. A control that only
responds to a click is unfinished.

In practice: a new choice belongs in a list the arrow keys already walk over,
not in a button beside it. If something new needs a click, it needs a key too,
and the key is the part that has to work.

## Mode keys pass through — Hard Rule

Ctrl+T, Ctrl+N and Ctrl+B switch modes, except when they name the mode you are
already in. There they are ignored, and the pane gets the keystroke.

That is not an oversight. Ctrl+N is nvim's autocomplete and Ctrl+T is the
shell's transpose. Take them and pressing Ctrl+N mid-word throws you out to the
terminal grid instead of completing the word. You leave a mode by naming a
different one.

Dialogs are not exempt, and two of them got this wrong before the rule was
written down here. **Every keydown handler starts with `if (isModified(event))
return;`**, before it looks at `event.key` at all. Take Ctrl+N in the card detail
dialog and pressing it mid-word opens a "Subtask title" box instead of going to
nvim. Take Enter with Cmd in the delete confirmation and a stray Cmd+Enter
deletes a card and its whole family.

## A refusal is explained where it is decided — Hard Rule

When one place decides to refuse something and another prints the message, the
two drift. Export the predicate from the file that enforces the refusal and call
it from the file that displays it.

What the drift looks like: someone changes `commitTitle` to refuse only while a
subtask is unfinished. You blank the title of a card whose subtasks are all in
Done. The card is deleted — and the status bar says `"Ship it" has subtasks —
delete it with d`. You read that, assume the card survived, and it is gone. No
test fails.

`hasSubtasks` and `attachmentRing` in `board.ts` are the two predicates that
exist. A third refusal worth a message wants a third.

## The help dialog is part of the change — Hard Rule

**Every task that adds, removes or changes a key, a mode, or what a screen does
updates `src/help.ts` in the same change.** Ctrl+H is where anyone finds out what
this app can do; a dialog that describes the version before yours is worse than
no dialog, because it is believed.

Two halves, both yours to keep true:

- The keys. The mode rows read `MODE_KEYS`, so those look after themselves. The
  board rows and the project rows are written out by hand, because the keys they
  name live in a switch in `board-view.ts` and in `mapShortcut`. Change one of
  those, change the row.
- The blurb. Each section opens with a sentence or two saying what that screen
  is. If a task changes what a screen does — not just how you drive it — the
  blurb is stale too.

A change is not done until Ctrl+H would tell the truth about it.

## Checks

    npm test        # vitest
    npx tsc --noEmit
    npx eslint .
