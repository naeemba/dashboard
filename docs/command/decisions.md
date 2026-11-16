# Command: decisions

Settled questions. Read the entry before re-litigating it.

## command-decision-1: Three built files, not one

`board-cli-entry.js` and `session-cli-entry.js` keep being built beside `dashboard-cli-entry.js`.
Every running shell holds `DASHBOARD_BOARD` and `DASHBOARD_SESSION` as paths to those two files, and
skills and worker hooks call them with no noun in front. Pointing either variable at the new entry
would turn `node "$DASHBOARD_BOARD" list` into "no such noun: list". The three entries share one
program per noun (`board-program.ts`, `session-program.ts`), so they cannot disagree.

## command-decision-2: The app is started only by commands that need it

`pane ...` and `project open`, `close` and `focus` start the app when none
answers; `board` and `project list`, `find` and `init` never do. Otherwise a
Claude session in another repo running `dashboard board list` pops a window up.
`pane notify` never starts it either: it is a worker's hook, and an app it
started would be one nobody asked for. Starting it is the user's ask in the
moment, so workflow-rule-1 holds; quitting, restarting or replacing stays out
of the command. One name, `dashboard`, for the launcher and the command: no
words opens the app as the old launcher did.

## command-decision-3: The launcher runs the command under node

The card asked for the app's own binary with `ELECTRON_RUN_AS_NODE=1`, so no
system node is needed. The `RunAsNode` fuse is off in `forge.config.ts`, so the
binary ignores it and starts a second app instead, and turning the fuse on lets
anything on the machine run code as the signed app (panes-decision-1 turned it
down for the pane host). The app already needs node for its
pane host, so the launcher runs `node` on the entry and passes the app's
executable as `DASHBOARD_APP`, which the command starts when no app answers.

## command-decision-4: The socket's path is in a file, not fixed

The socket stays in a fresh 0700 folder per launch (session-socket.ts), and the
app writes its path to `session-socket` in its userData folder, 0600, removed at
quit. A fixed path would let a second build take over the first's socket; the
file only names one, and reaching it still takes the 0700 folder.

## command-decision-5: `pr land` is a command, and not allowed unasked

Managers kept the land steps in a `/tmp` script (land.sh ran 130 times in one
retro, and was lost when `/tmp` filled). The steps are the review worker's
(`reviewPrompt`, ship/review.ts): note the head, wait on the checks, merge that
commit with `--match-head-commit`. As a verb they cannot be copied out wrong.

It is not added to the `permissions.allow` rules every session starts with
(workers-decision-9), unlike `pane` and `board`: a merge is outward-facing, and
#290 was merged by a prompt with nobody's go-ahead. A session asked to land runs
it under its own permissions.

A `budget` verb (the seven-day usage against a cap) was asked for with it and
left out: the only source is the Agent SDK's
`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`, which needs a live
SDK session and is named not to be relied on. The Claude screen's status line
shows it; a gate built on it says nothing the day it changes. Built since on
another source: command-decision-6.

## command-decision-6: `budget` reads the statusline's file, and stale is unknown

The user's statusline writes `~/.claude/usage-7d.json` each time it draws
(dotfiles 37d4807), the figure Claude Code hands it. That is the source
command-decision-5 lacked: a file, read with no SDK session. It is written only
while some session is on screen, so a reading over 30 minutes old exits 2, as a
missing or broken one does: a new-crm manager ran a hand-made budget script 59
times overnight, and a stale "under" is the loop running past the cap. A
reading dated more than 5 minutes ahead exits 2 too: a clock three hours fast
when it wrote would otherwise make it fresh for three and a half hours.

The cap is `budget.weeklyCap` in settings.json, set once with `budget --cap` or
on the settings screen, so a loop never has to be told it again. `--cap` writes
the file with the app possibly running, so main watches the file and takes any
change it did not write itself (settings.adopt); without that, the next save from
the settings screen put the old cap back. Exit 2, not 1, for a refused word too,
since 1 means over. Reading it is allowed in the settings every session starts
with (workers-decision-9); `--cap` is not.

The statusline alone was not enough: the user works almost entirely in the
app's Claude screens, which run through the SDK and never draw a statusline, so
the file went a week unwritten and every reading was unknown. The app writes the
same file from the 7-day figure the status line's measure already reads
(`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`, no model request),
at most once a minute (`src/main/usage/weekly-usage-file.ts`). The SDK's
`rate_limit_event` was not used: it names only the limit currently binding.
If the experimental call changes, the file goes stale and budget exits 2; it
never says under.

