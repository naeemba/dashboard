# Keys: decisions

Settled questions. Read the entry before re-litigating it.

## keys-decision-1: The three board-scope keys that do nothing on a project's board

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

## keys-decision-2: Ctrl+Q does nothing on the manager's board, command or notes screen

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

## keys-decision-3: `MODE_KEYS` is gone

`src/shared/keys/modes.ts` holds `PROJECT_MODES`, which is what that table always was: the
views a project's page has, and so the modes `session.ts` restores a project
onto. The four mode keys are ordinary rows in `src/shared/keys/actions.ts`, so they can be
rebound, and the pass-through check runs against the action rather than the key.
Rebind Ctrl+T and the new key is what passes through.

`MODES` is `PROJECT_MODES` plus the manager's own two. A view added to `MODES`
but not `PROJECT_MODES` works until you restart, and then the app comes back on
terminals with nothing saying why.

## keys-decision-4: The which-key strip needs nothing from you

Hold Ctrl, Cmd or Alt without pressing a key and it names every key that
modifier can still start here. It is printed from `src/shared/keys/actions.ts` and filtered
by the same `hears` the window's lookup asks, so a row added there is on the
strip the day it exists — including a row that does nothing on that screen.
The blurb stays yours: the strip says what a key does, never what a screen is.
