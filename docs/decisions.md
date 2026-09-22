# Decisions already made

Settled questions, kept out of `CLAUDE.md` so they are not re-sent on every
turn. Read this before re-litigating one of them.

## The three board-scope keys that do nothing on a project's board

Board scope is wider than the manager's board. Two keys pick a project and one
Escape goes back to the manager's list. All three are board scope, because the
manager's board *is* a board. A project's own board therefore hears them too,
where the first two have nowhere to go and Escape is swallowed by a
`setMode('manager')` that finds no manager view. Ctrl+H lists all three there
and they do nothing.

Moving them was considered and rejected:

- The two that pick a project do not move. `manager-page` is every section,
  so Cmd+Up on the general list, the command screen or the notes would swap
  which project's board waits behind them, with nothing on screen saying so.
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
