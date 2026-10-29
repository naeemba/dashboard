# Decisions already made

Settled questions, kept out of `CLAUDE.md` so they are not re-sent on every
turn. Read this before re-litigating one of them.

## The three board-scope keys that do nothing on a project's board

Board scope is wider than the manager's board. Two keys pick a board and one
Escape goes back to the manager's list. All three are board scope, because the
manager's board *is* a board. A project's own board therefore hears them too,
where the first two have nowhere to go and Escape is swallowed by a
`setMode('manager')` that finds no manager view. Ctrl+H lists all three there
and they do nothing.

Moving them was considered and rejected:

- The two that pick a board do not move. `manager-page` is every section,
  so Cmd+Up on the general list, the command screen or the notes would swap
  which board waits behind them, with nothing on screen saying so.
- Escape does not move. `mode-manager` on `manager-page` puts it on the command
  screen, where `command-cancel` already holds it, and `actions.test.ts` fails
  on the clash.

Watch for: the next thing that wants Escape on a project's board will not fire,
and will not say why.

## Ctrl+Q does nothing on the manager's board, command or notes screen

Ctrl+Q is global, so Ctrl+H lists it on every screen, and it closes the
project whose page you are on. The manager's page is not a project. Its list
has a highlight, so the key closes the highlighted project. Its board, command
screen and notes have no highlight naming one project, so there is no project
the key could mean.

Press Alt+L from the manager's list to its board, then Ctrl+Q. Nothing happens,
and Ctrl+H still says `Ctrl+Q  Close this project`.

`help.test.ts` cannot catch this. It checks that `mapShortcut` answers to every
key the dialog names, and `mapShortcut` does answer — with an action nothing on
those three screens acts on.

## `MODE_KEYS` is gone

`src/modes.ts` holds `PROJECT_MODES`, which is what that table always was: the
views a project's page has, and so the modes `session.ts` restores a project
onto. The four mode keys are ordinary rows in `src/actions.ts`, so they can be
rebound, and the pass-through check runs against the action rather than the key.
Rebind Ctrl+T and the new key is what passes through.

`MODES` is `PROJECT_MODES` plus the manager's own two. A view added to `MODES`
but not `PROJECT_MODES` works until you restart, and then the app comes back on
terminals with nothing saying why.

## Why the refusal rule exists

It happened before `isFontSize` existed: `parseSettings` held its own copy of
the 6-to-72 range. A size the settings screen accepted was silently discarded
the next time the file was read, with nothing on screen saying why.

`withoutShipped` is the same idea one step over. It decides what a line has to
be before it belongs in settings.json, and both writers ask it — the save and
the launch tidy. Add a `scrollback` setting that ships as 1000, teach only the
save to leave it out, and an old file holding `"scrollback": 1000` is never
tidied. When the shipped default moves to 5000, that person stays on 1000.

## The which-key strip needs nothing from you

Hold Ctrl, Cmd or Alt without pressing a key and it names every key that
modifier can still start here. It is printed from `src/actions.ts` and filtered
by the same `hears` the window's lookup asks, so a row added there is on the
strip the day it exists — including a row that does nothing on that screen.
The blurb stays yours: the strip says what a key does, never what a screen is.

## One version line, not two

The card that added it asked for a version "in the manager tab and on the
app". It ships one: `v1.1.0` along the foot of the manager page, read from
`package.json` at build time. There is no second display inside a project's
own view.

The manager page is the one screen every project sits under, open or not, so
it is the one place a version is guaranteed to be on screen already. A second
copy inside each project's view would need its own layout, would only be
visible while that project was open, and would say the same number the foot
line already says. Hold the foot line up against `package.json` on `main` —
that is the comparison the card asked for, and it needs only the one line to
make it.

## An unreadable worktree record stops the launch

`worktrees.json` cannot be read — EMFILE, EIO, a permissions change. The app
shows a box naming the file and exits. It does not open with an empty list.

Carrying on was considered and rejected. An empty list is not a safe fallback
here, because the launch prunes it and writes it back: the emptiness goes over
worktrees that are still on disk, they drop off Ctrl+W, and shipping one of
those cards again makes a second branch and a second folder beside the first.
Making it safe takes three new branches — skip every write for the run, say so
on the worktree list instead of "nothing shipped", and refuse a ship that would
record nothing — and each one missed puts the orphan back.

A refused launch costs nothing but the launch. No shell exists yet, no project
is open, and nothing is in flight inside the app, so there is no work to lose:
you open it again. If the failure is permanent the box names the file, which is
the one thing needed to fix it by hand.

This is not how the board answers the same failure, and that is on purpose.
`readBoard` throws into an IPC handler with a window already up, so the message
reaches the status bar and the rest of the app keeps working. There is no status
bar at launch.

## A failure nothing caught keeps the app running

An uncaught exception or a rejected promise nobody handled reaches the main
process. The message goes on the status bar and every shell keeps running.

Node's own answer is to end the process, and for most programs that is right:
nobody knows what state is left, so stop. Here it is the worst outcome there is.
Every pane is a shell that exists only inside this window — an `npm test`
halfway through, a deploy, an agent mid-card — and none of it comes back.
Closing the window on purpose asks first, and CLAUDE.md calls Force Quit the one
exit that takes the shells without asking. A rejected promise from a five-second
timer must not be a second one.

That is the opposite of what the same failure costs at launch, and on purpose.
Before a window has ever opened there is no shell to lose and nowhere to print,
so an uncaught failure there gets a box and an exit — the same answer the
worktree record above gets, for the same reason.

A failure somebody *did* catch is a third thing again. It is caught where the
cost is known, so the launch can go on without that one part: a `.env` that will
not load costs the settings in it and nothing else, and the app opens with a
line on the bar saying which file. A failure that reaches the last resort says
nothing about what still works, which is why it does not get that choice.

Watch for: the bar holds one line. A thing that fails on every tick writes over
whatever was there, every tick.

## A file path in a pane opens in nvim

A path a pane prints — `src/main.ts:42`, `./notes.md`, `~/.zshrc` — underlines
like a URL does, and clicking it opens the file in the project's nvim at that
line. The hint key (Alt+O) is the keyboard's way to the same thing: a letter
over every path on the screen, one keystroke to open it. Both read their paths
through `file-links.ts`, so a path you can click is a path you can label.

A relative path is looked for in the folder the pane's shell stands in now, read
from the running process, then the folder the pane started in, then the
project. An agent shipped into a worktree prints paths relative to the
worktree, and a shell that has `cd`'d somewhere prints paths relative to there;
the project root alone would open the wrong copy of the file, or none.

What reads as a path is decided without touching the disk, so `and/or`
underlines too. Asking main about every row under the pointer would cost an IPC
round trip per hover for a false underline that, once clicked, says "there is no
file and/or here". The file is only looked for when you open one.

The file opens with `:drop`, in the window you were editing in, not a new tab.
The scrollback gets a tab because it is a copy you read beside your work; a
path is a file you went to.

## The host owns the list of open projects

Two screens can open and close projects, so the renderer no longer decides what is open. Main does, and
pushes `projects:change` with the whole list; each renderer makes its pages match through
`pageMoves` in `page-reconcile.ts`. The reply to a renderer's own `projects:open` carries the same
list, so the push and the reply are idempotent whichever lands first. Settings stay on the screen that
shows them: a mac on a Linux host keeps its Cmd keys.

## Comments do not count toward the 600-line ceiling

`main.ts` and `renderer.ts` are measured in code lines with `grep -cvE '^\s*(//|$)'`. Comments are never
dropped or packed to fit. This branch moved `processTree`, `baseBranch` and `shellLivesIn` out of
`main.ts`, and `showPicker` and page syncing out of `renderer.ts`, instead.

## The Claude screen answers permissions itself, in one long session

The Claude screen runs `query()` in streaming input mode, one per project page, and keeps it open:
every prompt goes into the same process, and a tool that needs a yes arrives through `canUseTool` and
waits there for the box over the prompt to answer it. Escape is `interrupt()`, which also declines
whatever was being asked.

The two projects the card pointed at were read first and neither is copied. opcode starts the CLI with
`--dangerously-skip-permissions` and stops a turn by killing the process. claude-code-webui runs a new
`query()` per message and handles a refused tool by sending the message again with the tool added to
`allowedTools`, which runs the turn twice. Both trade the question away; this screen exists to ask it.

The session starts on the first prompt, not on opening the screen: the CLI is a process per project,
and a screen glanced at once should not hold one open all day.

The app keeps the conversation's id per project in `chat-sessions.json` in the app's data folder,
never in `.dashboard/`, since a conversation is personal and the board is tracked. The id is the one
each turn's `init` message reports, not one the app picks: `/clear` moves the session to a new
conversation with a new id, and only `init` says which. The next launch reads it back with
`getSessionMessages` and resumes it on the next prompt. A resume that fails forgets the id, so the
prompt after it starts fresh instead of failing the same way again.

`@path` is passed through as typed: the CLI expands it into the file's contents the way it does in a
terminal, checked against the pinned SDK by asking for `@package.json`'s version with no tools used.

## Slash commands are the session's; the screen adds the list and two of its own

Every command typed into the box goes to the session as a prompt, and the CLI runs it the way it does in
a terminal: skills, the project's commands and its own (`/compact`, `/context`, `/clear`, `/model x`).
Checked against the pinned SDK by sending them through `query()`. What a terminal draws as a dialog
the session answers with "isn't available in this environment"; of those, `/resume` and `/plan` are
answered by the screen itself (chat-commands.ts) and never sent.

The list comes from `supportedCommands()`, which only a running session answers, so the first slash
typed starts the session. That bends "the session starts on the first prompt" on purpose: a slash is
somebody about to send one. Nothing is remembered until a prompt is sent and `init` names the
conversation, so a session started for the list and closed with the app leaves the next launch as it
was.

`/resume` lists the folder's conversations with `includeWorktrees: false`. A project's workers run in
its worktrees, and with them in the list the project's own conversations are lost among theirs.

Plan mode is on the edits key, after accepting, the terminal's order. The plan arrives as the ask for
`ExitPlanMode`, drawn as markdown with Claude Code's three answers. Each yes sends a `setMode` with
it, because the session leaves plan mode for `default` on a bare allow and the terminal's first
answer goes on accepting edits.

## The main session and its workers

A project's terminals are its main session, pane 0, full height on the left, and worker panes in a
scrolling list on the right, as many as have been opened. The card asked for this; four things it said
were changed on the way, each for a reason that is the card's own goal.

**The focus keys are not Ctrl+1..9.** Ctrl with a digit is the tab jump on every platform, and taking it
would cost every tab key to reach a pane. The nine focus rows are where the five were: Cmd with a digit
on a mac, and Alt with a digit elsewhere, which used to ship unbound. The first is main, the rest count
down the worker list by place, not by pane number, so the second key is always the top worker. Past
the eighth, Alt+J/K walk the list.

**Main is called `main-<project>`, not `main`.** Every open project has a main session, and a worker's
SendMessage to `main` with two of them open names two sessions. dispatch.ts spells it.

**The Stop hook marks the pane instead of messaging main.** A hook is a shell command, and Claude Code
has no command that sends a message to a named session; the mailbox under `~/.claude/sessions` is its
own undocumented business. So the hook runs `session notify <id> done`: the pane gets a green edge and
`session list` says `done`, which is what main reads for a worker that forgot to write or died before
it could. The worker's own prompt still ends by telling it to SendMessage main.

**A throwaway worktree is not on the worktree record.** That record is per card, and a throwaway
worktree has no card. The manager's worktree list finds it through git like any other folder, and
release removes it only once `unfinishedWork` in finished-work.ts says its work is committed, pushed
and has a pull request. Kept otherwise, and the reply says why. Which pane held it lives in memory, so
a restart forgets it and it is left for the manager's list to remove.

**Release kills only main's worker, while it is still there.** main.ts keeps one record of the panes
holding main's worker now: a session run adds the pane, and the agent exiting, anything else started in
the pane, or the pane closing takes it out. session.json marks those panes `dispatched`, so after a
restart they come back as main's workers, resumed as the pane's agent with the worker's flags, and no
other conversation does: a card's agent a ship started, or a Claude you opened by hand, is refused.

Watch for: worker numbers stay put while others close, and a new one takes the lowest number free,
so it can appear in the middle of the list. Workers come back after a restart only when they were
running Claude Code; a plain shell worker does not.
