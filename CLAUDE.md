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

Inside an overlay the key goes nowhere at all. A dialog has focus, so no pane
can receive the keystroke anyway.

**Every dialog that reads `event.key` for itself must check `if
(isModified(event)) return;` first, or a modified key does something in it
that it was never meant to.** That is the help dialog, the card detail
dialog, the delete confirmation, the picker's search box, the settings
screen, and the card title and description editor. Two of them got this
wrong before the rule was written down here. Take Ctrl+N in the card detail
dialog and pressing it mid-word opens a "Subtask title" box. Take Enter with
Cmd in the delete confirmation and a stray Cmd+Enter deletes a card and its
whole family.

The window listener in `renderer.ts` is not one of these and never needed the
guard: it does not read `event.key` at all. It hands the whole keystroke to
`mapShortcut`, which matches every modifier exactly, so a key held with Ctrl
can only fire an action someone actually bound to that exact combination.
Shift+Arrow, which moves a card, and Tab, which attaches one, are ordinary
rows in `src/actions.ts` now — not special cases written into a handler. A
plain `Tab` binding simply cannot match `Ctrl+Tab`, so the window switcher
still gets it, and nobody had to write code to let it past.

Two real exceptions read a key before the guard, both on purpose:

- Tab, in the picker's search box. Nothing else in that dialog is focusable,
  so Tab and Shift+Tab would drop focus into the pane behind the overlay.
- Every key, in the settings screen, while a row is armed. A row waiting for a
  binding has to read Ctrl, Cmd, Alt and Shift, or those four are the only keys
  you could never bind. It is one keystroke long and puts the guard back
  immediately after.

If a handler reads a modified key anywhere else, it is stealing it.

The mode keys are not `MODE_KEYS` any more. They are three rows in
`src/actions.ts` like any other action, which means they can be rebound, and
the pass-through check at the top of this section runs against the action
rather than the key — so if Ctrl+T becomes something else, the something else
is what gets passed through, not the key that used to be Ctrl+T.

## A refusal is explained where it is decided — Hard Rule

When one place decides to refuse something and another prints the message, the
two drift. Export the predicate from the file that enforces the refusal and call
it from the file that displays it.

What the drift looks like: someone changes `commitTitle` to refuse only while a
subtask is unfinished. You blank the title of a card whose subtasks are all in
Done. The card is deleted — and the status bar says `"Ship it" has subtasks —
delete it with d`. You read that, assume the card survived, and it is gone. No
test fails.

It already happened once, smaller: before `isFontSize` existed, `parseSettings`
held its own copy of the 6-to-72 range. A size the settings screen accepted
could still get silently discarded the next time the file was read, with
nothing on screen saying why.

Five predicates exist for this reason: `hasSubtasks` and `attachmentRing` in
`board.ts`, and `holderOfBinding`, `isHexColor` and `isFontSize` in
`settings.ts`. A refusal worth a message reuses one of these or adds a sixth —
never a second copy of the condition.

The prose counts too. A comment that restates a rule living in another file is a
second copy that no test can catch — the code stays right while the sentence goes
stale. The bell handler in `renderer.ts` spelled out `marksWaiting`'s rule beside
the call to it; loosen the rule in `waiting.ts` and the handler still reads as if
it never changed. Say what the wiring does, and let the module say what the rule
is.

## The help dialog is part of the change — Hard Rule

**Every task that adds, removes or changes a key, a mode, or what a screen does
updates `src/help.ts` in the same change.** Ctrl+H is where anyone finds out what
this app can do; a dialog that describes the version before yours is worse than
no dialog, because it is believed.

Two halves, both yours to keep true:

- The keys. Every row is printed from the one table in `src/actions.ts`, so
  adding a shortcut means adding a row to that table and nothing else — the
  handler, the help dialog and the settings screen all read it.
- The blurb. Each section opens with a sentence or two saying what that screen
  is. If a task changes what a screen does — not just how you drive it — the
  blurb is stale too.

A change is not done until Ctrl+H would tell the truth about it.

## Checks

    npm test        # vitest
    npx tsc --noEmit
    npx eslint .

## A decision gets its own module and a test

`renderer.ts` is wiring: it reads the browser, calls a function, draws the
answer. A rule with branches in it — *window focused? is this the pane I am in?
do I notify?* — goes in a small module beside a `.test.ts`, the way `session.ts`,
`board-state.ts`, `terminals.ts`, `shell.ts` and `waiting.ts` already do.

Left inline, nothing pins it. Someone swaps `document.hasFocus()` for a window
flag, every test still passes, and a bell from the pane you are staring at
starts turning your own project yellow.

The main-process event handlers in `main.ts` are exempt. The quit guard is the
example: `askingToQuit` has no branch of its own to test — it only says whether
the dialog is already up. What could actually break is Electron's plumbing
around it, and every piece of that is Electron's, not ours: `preventDefault` on
`close`, a promise from `dialog.showMessageBox`, `destroy()` raising no second
close. A test for it is a test of mocks, which passes whatever we do to the real
handler. So these stay inline, and a change to one is read rather than run.

## IPC channels are `<noun>:<verb>`

The thing first, then what you do to it: `link:open`, `session:write`,
`board:read`, `pty:resize`, `notification:show`. Every channel in
`src/preload.ts` follows it.

`notify:show` did not — two verbs, nothing named. Grep for the channels that
touch notifications and it does not sort next to them, so the next person adds
`alert:send` and now there are three spellings of one idea.
