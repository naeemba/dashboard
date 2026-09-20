# dashboard

Electron terminal dashboard. Each project is a page of five shells.

Settled questions live in `docs/decisions.md`. Read it before re-opening one.

## Checks

    npm test        # vitest
    npx tsc --noEmit
    npx eslint .

## Never rebuild or restart the running app — Hard Rule

**Do not quit, kill, restart, or replace the Dashboard app running on this
machine unless I ask for it in that same conversation.** No `npm run package`
into /Applications, no `osascript ... quit`, no `pkill`, no `open -a Dashboard`.

Restarting kills every shell inside it, including long-running tasks, with no
way to get the work back. The quit also fires node-pty's exit callback during
teardown, so it surfaces as a SIGABRT crash report and looks like the app broke.

After changing code: run the tests, say the installed app needs a rebuild and
restart to pick the change up, and stop there. Building into `out/` or `.vite/`
is fine — nothing runs from those.

## Keyboard first — Hard Rule

Every action must be reachable from the keyboard alone. A control that only
responds to a click is unfinished. A new choice belongs in a list the arrow keys
already walk over, not in a button beside it.

**A click on a row moves the selection to that row, then does what Enter does
there.** The highlight is the only thing on screen saying where the keyboard is.
Click `web` to open it, press Enter, and `api` collapses — you opened one
project and closed another.

That holds where Enter does nothing too. A quiet project has nothing to open, so
the click only moves the selection; if the screen is not redrawn, the highlight
stays on `api` while the keyboard is on `web`.

**A mouse gesture that reaches one of the manager's boards makes that board
active first.** Otherwise you click a card on `api`, press Shift+Right, and a
card in `web` moves — into Ship if it was in Todo, which makes a worktree and
starts an agent on the project you were not looking at. An inactive board's
outline is off in the CSS, so nothing on screen says where the keyboard went.

## Mode keys pass through — Hard Rule

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

Four exceptions read a key before the guard, all on purpose:

- Tab, in a search box — the project picker's and the board's card search, which
  are one dialog in `searchOverlay`. Nothing else there is focusable, so Tab
  would drop focus into the pane behind the overlay.
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

## Every box you type into carries `dir="auto"` — Hard Rule

**A new `<input>` or `<textarea>` gets `input.dir = 'auto'` in the same change
that adds it.** Everything outside a pane is `unicode-bidi: plaintext`, which
fixes reading order but not the caret. Without it you type a Persian card title
and the text runs away from the cursor, ending punctuation lands on the wrong
side, and Home and End go to the opposite ends of what you see.

No test or lint rule covers this. The check is that these two agree:

    grep -rn "createElement('input')\|createElement('textarea')" src/ | wc -l
    grep -rn "dir = 'auto'" src/ | wc -l

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

What drift looks like: someone changes `commitTitle` to refuse only while a
subtask is unfinished. You blank the title of a card whose subtasks are all
Done. The card is deleted — and the status bar says `"Ship it" has subtasks —
delete it with d`. You read that, assume the card survived, and it is gone. No
test fails.

Sixteen predicates exist for this, in `board.ts`, `settings.ts`, `ship.ts`,
`pane-reading.ts`, `notes-state.ts` and `board-state.ts`. A refusal worth a
message reuses one or adds a seventeenth — never a second copy of the condition.

    grep -rn "export function \(hasSubtasks\|blockingChanges\|mayEdit\)" src/

A predicate is only worth anything if it asks the same question as the thing
doing the refusing. `blockingChanges` skips `.dashboard/` on purpose, so a ship
does not refuse itself over the Ship move that started it. Ask it before `git
worktree remove` and it answers "nothing in the way" about a worktree git is
about to refuse: the app's own message never prints and a raw `fatal: ...
contains modified or untracked files` lands on the card instead. `changedFiles`
is the same list without the exemption, and that is the one the worktree list
and the review ask.

The prose counts too. A comment that restates a rule living in another file is a
second copy no test can catch — the code stays right while the sentence goes
stale. Say what the wiring does; let the module say what the rule is.

## The help dialog is part of the change — Hard Rule

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
That is settled — see `docs/decisions.md` before changing it.

## A decision gets its own module and a test

`renderer.ts` is wiring: read the browser, call a function, draw the answer. A
rule with branches in it — *window focused? is this the pane I am in? do I
notify?* — goes in a small module beside a `.test.ts`, the way `session.ts`,
`board-state.ts`, `terminals.ts`, `shell.ts` and `waiting.ts` do.

Left inline, nothing pins it. Someone swaps `document.hasFocus()` for a window
flag, every test passes, and a bell from the pane you are staring at starts
turning your own project yellow.

The main process's event wiring and its spawning are exempt — wherever they
live, not `main.ts` the file. `askingToQuit` has no branch of its own; what
could break is Electron's plumbing, and a test of that is a test of mocks.

The exemption travels with the code, not the filename. `task-runner.ts` sits
outside `main.ts` and is still exempt: it spawns a process and hands the lines
on. But a decision that moves out alongside the wiring is not — which report to
send when a process ends is `finishedTasks` in `tasks.ts`, tested. `review-flow.ts`
takes the same ports shape and is not exempt for taking it: the order a ship's
second half happens in is a decision, and `review-flow.test.ts` pins it.

Wiring is exempt wherever it sits; a branch owes a test wherever it sits.

## The board has two writers — Hard Rule

The app is not the only thing writing `.dashboard/board.json`. The `board`
command does too, and an agent working a card uses it to move its own card.
**Anything that writes a board goes through `board.ts` and `board-store.ts` —
never its own JSON.**

What a second copy costs: someone teaches the command line to write a card
without `createdAt`. The app reads it back, `relativeAge` has nothing to show,
and the card's detail dialog says the card was never made. Nothing fails; the
board quietly stops agreeing with itself.

`board-cli.ts` holds the command's decisions and every one is a call into
`board.ts`. `board-cli-entry.ts` is the file and the terminal, with no decision
in it.

The app has to notice. Main watches each open project's `.dashboard` folder and
sends `board:change`, and the board re-reads itself without moving your
selection. It watches the *folder*, not the file — `writeBoard` renames a
temporary file over `board.json`, and a watch on the file follows the old one
into the bin. It compares bytes against what the app last wrote, or every
keystroke would redraw the board under your cursor thirty times a minute.
`isBoardChange` in `board-watch.ts` is that rule, with the test.

**A card with a pull request open goes in `Review`, not `Done`.** A column on
`main` says what has been merged; `Review` is the exception — a pull request
open and nothing has checked it. This beats the global instruction to move a
card to Done once the PR is ready, which is written for boards with no Review
column. Otherwise the board says a feature is finished and checked while nobody
has looked at it, and `Review` sits empty in front of the person whose job it is
to look.

**The move into `Done` happens on the branch first, and only then is the pull
request merged.** The branch's board is the copy the merge carries into `main`,
so a card moved after the merge never reaches `main` at all. Move it afterwards
and `main` goes on committing `Review` for a feature that shipped weeks ago,
while the only copy saying `Done` is an uncommitted change in one person's
checkout — true on screen, true nowhere else, and never converging. This repo's
own board was found exactly like that: `origin/main` saying `Review` for a
merged card and the working tree saying `Done`.

The app's board is moved too, after the merge, because it is what is on screen
and nothing on screen changes when a merge happens on a server. Both moves, in
that order: branch, merge, app. `reviewPrompt` in `review.ts` is where it is
written down, and `review.test.ts` pins the order.

## IPC channels are `<noun>:<verb>`

The thing first, then what you do to it: `link:open`, `session:write`,
`board:read`, `pty:resize`, `notification:show`. Every channel in
`src/preload.ts` follows it.

`notify:show` did not — two verbs, nothing named. Grep for the channels that
touch notifications and it does not sort next to them, so the next person adds
`alert:send` and now there are three spellings of one idea.

## Every merged card bumps the version

`package.json`'s `version` is what the manager's foot line and the app itself
show. A card that merges without moving it makes that number a lie: three more
cards land, none touches the line, and the number on screen still says the
build is current when it is three cards behind.

Bump it in the same pull request that merges the card — patch for a fix, minor
for a new capability, major for a break.
