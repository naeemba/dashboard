# Settings

One file, one table, one screen: `settings.json` beside the `.env` main reads,
holding the key bindings, font size and shell, and edited from the settings
screen where a row is armed and the next keystroke becomes its key.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

### Settings, host and worktree list

There is a second way to find a key, for when you know you are reaching for one
and not which. Hold Ctrl, Cmd or Alt without pressing anything else and a panel
near the bottom names every key that modifier can still start on the screen you
are on, each row saying what is left to press. Add a second modifier and the
list narrows to what that one reaches; let it go and the list widens again.
Press the key and it does the thing, as though the panel had never been there.
Shift on its own does not open it — Shift is how you write a capital.

Every key the settings screen lists can be changed, and so can the colours, the
font, the shell and the place the manager's weather is for. They are kept in
~/.config/dashboard/settings.json, which you can also edit by hand. It holds
only what you changed; anything you left alone follows the app's default,
including when that default moves. The app tidies the file each time it starts,
so a line you write that already matches the default is taken out again. Delete
it and everything is back to how it shipped. A change to the file while the app
runs — by hand, or `dashboard budget --cap` — is taken at once (settings.adopt):
a file that does not parse, as one half-saved in an editor, is ignored until it
does, a deleted one is put back by the app's next save, and a file with no host
token keeps the one the app holds. An open settings screen
starts its next change from the new copy.

The Review row (`review.autoLoop`, default on) says whether a shipped card whose
pull request opens starts its review loop by itself. Enter turns it over. Off,
the card waits in Review until you move it into Review or run
`dashboard board review <id>` (docs/actions).

The Review section's second row, Merge (`review.autoMerge`, default off), says
whether that review loop merges the pull request once it and CI are green. Off,
the review stops there and reports to the project's main, and you merge. A
project's `autoMerge` in `~/.dashboard/projects.yaml` wins over this row
(ship-decision-1, [projects](../projects/README.md)).

The Updates row (`updates.check`, default on) says whether the app reads
GitHub's newest release on launch and every six hours. Enter turns it over; off,
the updates key still checks when pressed (docs/updates).

The Errors row (`errors.notify`, default on) says whether an error on the status
bar raises a desktop notification while the window is not in front. Enter turns
it over (docs/errors).

`browser.idleMinutes` (default 30, written in the file by hand only, `null` for
never) is how long a main's browser tab goes unused before that main is asked
whether it may close it (docs/browser).

The Budget rows say what `dashboard budget` holds the 7-day usage to. The limit
row (`budget.limit`, default the weekly cap) walks the weekly cap, the daily pace
and no limit on Enter. The weekly cap (`budget.weeklyCap`, default not set) is
the share, in percent, it calls over: above 0 and at most 100, or empty for not
set, which under the weekly cap makes `budget` exit 2. The
daily pace (`budget.dailyShare`, default a seventh of the week) is the share
added for each day begun since the weekly reset, in the same range. A figure
typed into either row also makes its row the limit; emptying a row does not.
`dashboard budget --cap` and `--pace` set the same lines
([command](../command/README.md), command-decision-6, command-decision-10).

`workers.cap` (default 4) is how many of main's workers run at once in one
project, and `workers.totalCap` (default 8) how many across every project; a
start past either waits in the pane pool's queue (docs/workers,
workers-decision-11). Each is a whole number, or `"none"` for no cap; on the
screen they are the two Workers rows, a number from 1 or empty for no cap. A
change is taken at once, and a lower cap stops nothing running.
`workers.stallMinutes` (default 20) is how long one of them at work goes with
no hook before it is shown stalled and main is told (docs/workers,
workers-decision-13); any number above 0, written in settings.json by hand.

The window's opacity (`opacity`, default 1) is written in the file by hand only:
0.7 lets the desktop show through behind the text, from 0.2 up; anything else
reads as 1, and stays in the file as you wrote it. Text stays solid and only the
background thins. Electron makes a window transparent only as it opens it, so
turning it on waits for the next launch; turning it back to 1 takes at once. On
Linux it needs a compositor. Electron lists more limits of a transparent window:
on Windows double-clicking the title bar does not maximize it, on macOS it has
no shadow, and on some platforms a resizable one can stop being transparent. The
title and status bars, dialogs, the ink page and a zoomed pane stay opaque, and
so does the project's browser, a native view the page cannot paint through.

The Host rows make this Dashboard reachable from another: a port, read at the
next launch, and the token the other machine pastes once. The port opens on
127.0.0.1 only, so the other machine reaches it through an SSH tunnel (ssh -L
7777:127.0.0.1:7777 host) and connects to 127.0.0.1:7777. To open it to the
network instead, write "bind" under "host" in settings.json — 0.0.0.0 for every
interface, or one address such as a Tailscale one; the wire is not encrypted,
and the token is the only thing between that network and your shells. Reset
everything to defaults keeps that token and the host this window last connected
to. The laptop must not sleep on lid close; that is the operating system's
setting.

The worktree list — its key is on this page — holds every card that has been
shipped, its branch, how old the worktree is, whether it has uncommitted
changes, and which pane its agent is in — no pane if every pane was already
taken when it shipped, or if the app has restarted since, because no shell
outlives it. Enter on a row goes to that pane; a row with no pane, and one whose
project has been closed since it shipped, say so rather than doing nothing. A
row leaves the list on its own only when its worktree has gone — removed in a
pane, or deleted by hand; nothing is ever removed for you. d removes one, asking
twice — the second question names the files if the worktree is dirty, and says
why git refused if it refused for some other reason. The folder and everything
in it goes, gitignored files included, and the pane its agent was in goes back
to being a plain shell in the project. The branch is left behind on purpose —
the pull request it came from may still be open.

## Files

Folders: `src/main/settings/`, `src/shared/settings/`, `src/renderer/settings/`.

- `settings.ts`, `settings-store.ts`, `settings-rows.ts`, `settings-view.ts`
- the app's writes go through settings.write and `budget --cap`'s and `--pace`'s
  through settings.cap and settings.pace, `src/main/actions/settings/`
  (docs/actions); a change on disk
  comes in through settings.adopt

## Scenarios

- Given a row is armed, when you press a key with modifiers, then that keystroke
  becomes the binding.
- Given a setting left at its shipped default, when the file is saved, then the line is left out.
- Given an old file holding a shipped default, when the app launches, then the
  launch tidy removes the line.
- Given an opacity under 0.2 or over 1, when the file is read, then the window
  is opaque.
- Given a font size the screen accepts, when the file is read back, then the
  same range check keeps it (errors-decision-1).
- Given the app running, when `dashboard budget --cap 60` writes the file, then
  main and the window take it, and the next save keeps it.
