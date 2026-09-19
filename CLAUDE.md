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

The other half, once a list has both: **a click on a row moves the selection to
that row and then does what Enter does there.** The highlight is the only thing
on screen saying where the keyboard is, so a click that acts on one row while
the highlight sits on another leaves the pointer and the keyboard naming two
different rows. You click `web` to open it, press Enter, and `api` collapses —
you opened one project and closed another.

One level up, on the manager's stack of boards: a mouse gesture that reaches one of
those boards makes that board the active one before the gesture runs. Otherwise you
click a card on `api`, press Shift+Right, and a card in `web` moves — into Ship if it
was in Todo, which makes a worktree and starts an agent on the project you were not
looking at. `api`'s highlight moved too, but an inactive board's outline is turned off
in the CSS, so nothing on screen says where the keyboard is.

That holds on a row where Enter does nothing too — the selection still moves,
and you still have to see it move. A quiet project has nothing to open, so the
click does only the moving; if the screen is not redrawn for it, the highlight
stays on `api` while the keyboard is on `web`, and the next Enter or Down comes
from a row you cannot see.

## Mode keys pass through — Hard Rule

The four mode keys switch modes, except when they name the mode you are
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
dialog, the delete confirmation, `promptOverlay`'s one-line box, the picker's
search box, the settings
screen, the card title and description editor, the worktree list, and the
manager list — which
asks `isBareCharacter` instead, because it takes Shift on purpose as the fourth
exception below. Both predicates read the same list of the three modifiers that
are not typing, so a fourth added to `stopsTyping` reaches both. Two of them
got this wrong before the rule was written down here. Take Ctrl+N in the card
detail dialog and pressing it mid-word opens a "Subtask title" box. Take Enter with
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

Four real exceptions read a key before the guard, all on purpose:

- Tab, in the picker's search box. Nothing else in that dialog is focusable,
  so Tab and Shift+Tab would drop focus into the pane behind the overlay.
- Tab, in the notes box, for the same reason one screen out. The box is the
  whole of that screen, so Tab takes the keyboard out of it with nothing on
  screen saying where it went, and Ctrl+Shift+N cannot bring it back — it names
  the mode you are already on and passes through. It is the only key that
  screen reads, so there is nothing after it for a guard to protect.
- Every key, in the settings screen, while a row is armed. A row waiting for a
  binding has to read Ctrl, Cmd, Alt and Shift, or those four are the only keys
  you could never bind. It is one keystroke long and puts the guard back
  immediately after.
- Shift, on the manager list. A capital is typed with Shift, so refusing it is
  refusing the `Y` in `Continue? [Y/n]` — the key the prompt asks for. Ctrl, Cmd
  and Alt are still refused, and anything bound to one of them is claimed by the
  window's lookup first, so nothing is stolen by letting a capital through.

If a handler reads a modified key anywhere else, it is stealing it.

The mode keys are not `MODE_KEYS` any more — that name is gone, and what is
left in `src/modes.ts` is `PROJECT_MODES`, which is what it always really was:
the views a project's page has, and so the modes `session.ts` will restore a
project onto. The keys themselves are four rows in
`src/actions.ts` like any other action, which means they can be rebound, and
the pass-through check at the top of this section runs against the action
rather than the key — so if Ctrl+T becomes something else, the something else
is what gets passed through, not the key that used to be Ctrl+T.

A new project view is a row in `PROJECT_MODES`, a row in `ACTIONS`, a view built
in `page.ts`, a branch in `focusMode` and a branch in `modeLabel` — and a name
and a blurb in `src/help.ts`, which the section below is about. `MODES` is not
on that list: it is `PROJECT_MODES` plus the manager's own two, so the row you
add is already in it. That was the row to forget — a view in `MODES` and not in
`PROJECT_MODES` worked until you restarted, and then the app came back on
terminals with nothing saying why.

## Every box you type into carries `dir="auto"` — Hard Rule

**A new `<input>` or `<textarea>` gets `input.dir = 'auto'` in the same change
that adds it.** The rest of the app is covered by one CSS rule — everything
outside a pane is `unicode-bidi: plaintext`, so a line takes its direction from
its first letter. That fixes the reading order but not the box: without
`dir="auto"` the cursor starts on the left, so you type a Persian card title and
the text runs away from the caret, ending punctuation lands on the wrong side,
and Home and End take you to the opposite ends of what you see.

Seven boxes have it today: the card title in `board-view.ts`, the description in
`board-detail.ts`, the picker's search box, the settings screen's text fields,
the command box in `command-view.ts`, `promptOverlay`'s one line in
`overlay.ts`, and the notes page in `notes-view.ts`. Nothing checks this — no
test, no lint
rule — which is why it is written
down here.

## `hidden` only hides what the stylesheet left alone — Hard Rule

`element.hidden = true` hides by way of the browser's own `[hidden] { display:
none }`, and any `display` in our CSS beats it. **So whenever a class gets a
`display`, every element that class hides with the attribute needs a
`.thing[hidden] { display: none }` beside it.**

What it looks like: the manager's column names and its total joined the rows'
`display: flex` so they would line up with them. Close every project and the
page says "No project is open, so there is nothing to watch yet." with `5h week
all` sitting over an empty list and a rule across the foot of the window holding
three blank cells. `.view[hidden]` in `index.css` is the same trap the other way
round — there the `display` is on purpose, so the views hide with `visibility`
instead.

No test can catch this: jsdom applies no user-agent stylesheet, so `hidden =
true` reads back as hidden there whatever the CSS says.

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

Fifteen predicates exist for this reason: `hasSubtasks`, `attachmentRing`,
`pullRequestFrom` and `isCommentBody` in `board.ts`, `holderOfBinding`,
`isHexColor`, `isFontSize` and `withoutShipped` in `settings.ts`,
`blockingChanges` in `ship.ts` — which both the ship's refusal and the message
listing the files in the way call, so the count on screen is exactly the list
that caused it — `paneIsBusy` in `pane-reading.ts`, which `freePane` asks to
pick a pane and `busyPanes` asks again to name the ones that stopped it, so a
ship that says every pane is in use lists exactly the panes it would not take,
and which the renderer asks too, over `panes:read`, because the command screen
picking a pane to type into and the close refusing over the panes it would kill
are the same question a ship asks and used to answer for themselves — and
`programIn` beside it, which is the words for what one of those panes is
running, so a ship refused by terminal 3 and a close refused by terminal 3
describe it the same way rather than `terminal 3 npm` in one place and
`terminal 3` in the other — and `mayRead`, `mayWrite` and `isStranded` in `notes-state.ts`,
where the notes box decides what it refuses and the status bar asks it what to
say, and `mayEdit` in `board-state.ts`, which the board asks before every
gesture and again when one bounces, so the key that does nothing and the
sentence explaining it read the same field. A refusal worth a message reuses one
of these or adds a sixteenth — never a second copy of the condition.

`withoutShipped` is the same idea one step over: it decides what a line has to
be before it belongs in settings.json, and both writers ask it — the save and
the launch tidy. Give one of them its own copy and the two drift. Add a
`scrollback` setting that ships as 1000, teach only the save to leave it out,
and an old file holding `"scrollback": 1000` is never tidied; when the shipped
default moves to 5000 that person stays on 1000, which is the bug the rule
exists to stop, with nothing failing.

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

One place it deliberately over-lists, so nobody re-finds it: board scope is wider
than the manager's board. The three keys that belong only there — the two that
pick a project and the Escape that goes back to the manager's list — are board
scope, because the manager's board *is* a board and hears what a board hears. So
a project's own board hears them too, where the first two have nowhere to go and
Escape is swallowed by a `setMode('manager')` that finds no manager view. Open
Ctrl+H on a project's board and those three rows are listed and do nothing.

Both of the things that were once too expensive for this now exist for another
reason: `manager-page` is a scope of its own, added for the section strip, and
`openHelp` is told which page you are on so the strip's keys are listed only on
the manager. So the question is no longer what they cost — it is what each of the
three keys would do if it moved.

The two that pick a project do not move. `manager-page` is all three sections, and
Cmd+Up on the general list or the command screen would swap which project's board
is waiting behind them, with nothing on screen saying it happened. Escape does not
move either: `mode-manager` on `manager-page` would put it on the command screen,
where `command-cancel` already holds it, and `actions.test.ts` fails on the clash.

So all three stay board scope and all three are still listed on a project's own
board, doing nothing. What to watch for: the next thing that wants Escape on a
project's board will not fire, and will not say why.

The close key is the second one, for the same reason read the other way round.
Ctrl+Q is global, so Ctrl+H lists it on all five screens, and it closes the
project whose page you are on. The manager's page is not a project. Its list has
a highlight, so the key closes the project the highlight is on; its board and its
command screen have no highlight naming one project — the board shows every
project's cards at once, the command screen a set of marked projects — so there
is no project the key could mean, and it does nothing there.

What that looks like: press Alt+L from the manager's list to its board, then
Ctrl+Q. Nothing happens, and Ctrl+H on that screen still says `Ctrl+Q  Close this
project`. Same on the command screen. `help.test.ts` cannot catch it — it checks
that `mapShortcut` answers to every key the dialog names, and `mapShortcut` does
answer, with an action nothing on those two screens acts on.

Both of those two go for the which-key strip as well — the third thing reading
that table, and the one that needs nothing from you. Hold Ctrl, Cmd or Alt
without pressing a key and it names every key that modifier can still start
here, printed from `src/actions.ts` and filtered by the same `hears` the
window's lookup asks, so a row added there is on the strip the day it exists —
and a row that does nothing on a screen is listed there too, for the same
reason. The blurb stays yours: the strip says what a key does, never what a
screen is.

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

The main process's event wiring and its spawning are exempt — wherever they
live, not `main.ts` the file. The quit guard is the example: `askingToQuit` has
no branch of its own to test — it only says whether the dialog is already up.
What could actually break is Electron's plumbing around it, and every piece of
that is Electron's, not ours: `preventDefault` on `close`, a promise from
`dialog.showMessageBox`, `destroy()` raising no second close. A test for it is a
test of mocks, which passes whatever we do to the real handler. So these stay
untested, and a change to one is read rather than run.

The exemption travels with the code, not with the filename. `task-runner.ts`
lives outside `main.ts` and is still covered: it spawns a process, listens to it
and hands the lines on, so a test of it is a test of `spawn` and three mocked
listeners. What it does not cover is a decision that moves out alongside the
wiring — which report to send when a process ends is `finishedTasks` in
`tasks.ts`, with `tasks.test.ts` beside it. `review-flow.ts` takes the same ports
shape and is not exempt for taking it: the order a ship's second half happens in
is a decision, and `review-flow.test.ts` pins it. So wiring is exempt wherever it
sits, and a branch owes a test wherever it sits.

## The board has two writers — Hard Rule

The app is not the only thing that writes `.dashboard/board.json` any more. The
`board` command does too, and an agent working a card uses it to move its own
card. **Anything that writes a board goes through `board.ts` and
`board-store.ts` — never its own JSON.**

What a second copy costs: someone teaches the command line to write a card
without `createdAt`. The app reads it back, `relativeAge` has nothing to show,
and the card's detail dialog says the card was never made. Nothing fails; the
board just quietly stops agreeing with itself. `board-cli.ts` is the whole of
the command's decisions and every one of them is a call into `board.ts`;
`board-cli-entry.ts` is the file and the terminal, and has no decision in it.

The other half is that the app has to notice. Main watches each open project's
`.dashboard` folder and sends `board:change`, and the board on screen re-reads
itself without moving your selection. It watches the *folder*, not the file:
`writeBoard` replaces `board.json` by renaming a temporary file over it, and a
watch on the file follows the old one into the bin. And it compares the bytes
against what the app itself last wrote, or the app is its own loudest writer —
every keystroke on a board saves, and the board would be re-read and redrawn
underneath your cursor thirty times a minute. `isBoardChange` in
`board-watch.ts` is that rule, with the test.

A card with a pull request open goes in `Review`, not `Done`. `board-store.ts`
says it: a column on `main` says what has been merged, and `Review` is the one
exception — a pull request open and nothing has checked it. That beats the
global instruction to move a card to Done once the PR is ready, which is
written for boards with no Review column. Otherwise the board on `main` says a
feature is finished and checked while nobody has looked at it, and `Review`
sits empty in front of the person whose job it is to look.

## IPC channels are `<noun>:<verb>`

The thing first, then what you do to it: `link:open`, `session:write`,
`board:read`, `pty:resize`, `notification:show`. Every channel in
`src/preload.ts` follows it.

`notify:show` did not — two verbs, nothing named. Grep for the channels that
touch notifications and it does not sort next to them, so the next person adds
`alert:send` and now there are three spellings of one idea.
