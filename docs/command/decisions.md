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

