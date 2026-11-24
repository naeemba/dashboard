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
retro, and was lost when `/tmp` filled). The steps were the review worker's
(`reviewPrompt`, ship/review.ts): note the head, wait on the checks, merge that
commit with `--match-head-commit`. As a verb they cannot be copied out wrong,
and since 2026-11-17 the review worker runs the verb too (ship-decision-1).

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


## command-decision-7: Bare `dashboard` prints the usage, and `pr land` needs checks where CI exists

Bare `dashboard` opened the app as the old launcher did (command-decision-2). An
agent learning the command runs it with no words, and each time the app came to
the front over the user's work. It prints the usage now; the app is opened from
its desktop entry, by any command that needs it, or with one of its flags.
`--version` is answered from the stamp built into the command file, the same one
the app checks the command against (app-handshake.ts): agents unpacked app.asar
22 times in one retro to read it, and asking the running app would say what is
running rather than what is installed.

`pr land` merged any pull request whose checks had not registered a minute on,
taking it for a repository with no CI. CI that never started on a commit (a
workflow whose trigger missed, a GitHub outage) merged unchecked. Only a
repository whose last twenty merged pull requests reported no check is merged so
now; one whose pull requests report checks is refused, and a workflow filtered
by `paths` that skips the change is landed by hand. Twenty, not five: a run of
docs-only or `[skip ci]` merges as long as the sample reads as no CI, and five
such in a row is common where twenty is not; the larger sample is still one
call. It asks the merged pull requests, not workflow files or Actions runs: the
file count took Dependabot, Pages and CodeQL default setup for CI and refused
every land in a repository with no CI on pull requests, and counting
`pull_request` runs missed CI on a `push` trigger or from an outside service,
merging unchecked there again. The fast-forward after a merge is `--ff-only` in
a checkout with nothing uncommitted, so it never merges or overwrites anything
of the user's: 19 git pulls and 7 `gh pr view`s followed lands in the retro.

## command-decision-8: The tools are the command, run once a call over stdio

Agents learned the command from prompt lines and `--help`, and in the three days
after v2.53.0 none ran `dashboard browser` once while other projects' workers
kept using Claude in Chrome: a tool in the session's list is found where a
command in a prompt is not. So `dashboard mcp` serves the command's verbs as MCP
tools, one per `<noun> <verb>`, with typed parameters (`mcp-tools.ts`).

Stdio through the command, not HTTP on the app's socket: Claude Code starts the
server per session in that session's environment, so a tool knows its pane the
way the command in its Bash does (command-decision-9), and board, project and
budget work with no app running, as the command does. The socket would
need a second protocol in main and a way to tell which pane is calling.

Each call runs the command file again as a child with the tool's words, rather
than the program in the server's process: every program writes to stdout, which
is the protocol's there, and sets the exit code. A refusal is the command's own
line as a tool error; the server decides nothing about any verb. A child is a
node start a call.

The usage texts stay hand-written. `mcp-tools.test.ts` reads every noun's usage
and fails on a verb with no tool and no line in `COMMAND_ONLY`, and on a tool
naming a verb or flag the usage lacks: one table, held against the usages,
instead of generating usage prose from it. `COMMAND_ONLY` is the two hooks
(`board guard`, `pane notify`), `project init` and `remove`, and `pr land`, which
waits on CI as long as it takes and is run in Bash in the background; the
server's instructions say so.

`browser screenshot` answers with the PNG itself as well as its path. The tools
allowed unasked are the verbs the command's Bash rules allow, plus `project list`
and `find`, which only read.

## command-decision-9: Every Claude screen gets the server, from its own environment

The app adds the server to every session it starts through the Agent SDK (main's
screen, a worker's, a card's agent) as `mcpServers.dashboard`, beside the user's
own servers. Claude Code hands a stdio server its own environment (checked with
a probe server that dumped it), and a screen's environment is `withPaneId`'s, so
the server needs nothing passed: `DASHBOARD_PANE`, the project and the socket
are already there.

A worker run with `--terminal` (Windows' default) does not get it: its flags go
through PowerShell's quoting, which already needs the settings JSON bent to
survive (`workerSettings`), and it keeps the command. A session outside the app
can add it with `claude mcp add dashboard -- dashboard mcp`; board, project and
budget work there, and pane and browser refuse as the command does with no
pane. The app does not register it in the user's own config.

Claude Code defers MCP tools behind its tool search (this machine's sessions
list them as deferred), so 42 tools cost their names in the list, not their
schemas. Descriptions are kept to a line.

## command-decision-10: The limit is a cap, a daily pace or none, and the pace reads the reset from the reading

One weekly cap was the wrong shape for the way the user spends the week: about a
seventh of it a day from the Friday 15:30 reset, so the figure they want moves
every day ("the cap is daily, it is 71 percent today"), and a new-crm main held
work twice against a cap of 25% set days before. So `budget.limit` picks one of
three. The cap is the fixed figure it was. The pace is `budget.dailyShare` (a
seventh of 100 when unset) for each day begun since the reset, at most 100.
None is for a user who wants no limit, and exits 0 rather than 2: 2 tells a
loop to stop, and stopping is not what no limit means. An unset limit is the
cap, so a file written before this reads as it did, and an unset cap still
exits 2.

Days are local calendar days, not 24-hour blocks from the reset: the user's 71%
was a Tuesday after a Friday afternoon reset, the fifth day begun, where 24-hour
blocks give the fourth. The window's last morning, before the reset, is day 7
and 100%.

The reset time is not a setting. Both writers of the reading are handed it: the
SDK's usage call has `rate_limits.seven_day.resets_at`, and the statusline's
input has `rate_limits.seven_day.resets_at` (the installed CLI builds it as
`seven_day:{used_percentage, resets_at}`), in epoch seconds like the
`five_hour` one the user's statusline already prints. So the app writes
`resetsAt` into the reading, and a pace with no `resetsAt` exits 2 rather than
guessing: a reading the statusline wrote without it, until the statusline adds
it, says so. A weekday-and-time setting would be a second copy of a time the
account already says, and wrong for every user whose reset is elsewhere.
