# Command: history

One line per merged change: date and why.

- 2026-11-01 #154 — One dashboard command with board and pane nouns (command-decision-1)
- 2026-11-04 — The dashboard command from any terminal: launcher, starting the app, --help, board
  --project, pane send, project focus (command-decision-2, command-decision-3, command-decision-4)
- 2026-11-16 — `dashboard pr land`: wait for the checks on the head commit, then merge that commit;
  `budget` left out (command-decision-5)
- 2026-11-16 — `dashboard budget`: the 7-day usage against `budget.weeklyCap`, stale or missing
  exits 2 (command-decision-6)
- 2026-11-16 — The app writes `~/.claude/usage-7d.json` from its Claude screens' measure, so
  `budget` reads fresh with no terminal statusline (command-decision-6)
- 2026-11-16 — `pr land` reads a failed merge back from the pull request: merged at the noted commit
  is merged, a network error on the merge or the wait is tried once more
- 2026-11-18 — `pr land` refuses a head no check started on where the repository's merged pull
  requests reported checks, and fast-forwards the base checkout after; bare `dashboard` prints the
  usage, `--version` the installed stamp; `pane list --reports`; `pane --help` says pane
  (command-decision-7)
- 2026-11-23 — `dashboard mcp` serves every command verb but the hooks', `project init`/`remove`
  and `pr land` as MCP tools, and every Claude screen the app starts has it: agents read the command
  from prompts and never ran `dashboard browser` (command-decision-8, command-decision-9)
- 2026-11-24 — `pr wait` waits on a pull request's CI without merging; every gh call in `pr land`
  and `pr wait` is tried again for about four minutes on a network error; a conflicting pull request
  names its files; the verdict is the last line: workers hand-rolled sleep and `gh run view` loops,
  a land gave up on a TLS handshake timeout, and main ran `gh pr view` after every land
- 2026-11-24 — `budget` holds the usage to a weekly cap, a daily pace since the weekly reset, or
  none (`--cap none` exits 0); the app writes the reset time into the reading: a fixed cap went
  stale every day for a user spreading the week evenly (command-decision-10)
- 2026-11-26 — `pr wait` and `pr land` refuse a draft no checks start on, saying to mark it
  ready, since a repository's CI may skip a draft; a draft whose checks run is waited on.
  `pr create`, `pr ready` and `pr comment` look at the pull request before trying again after a
  GitHub 5xx or lost answer, and `create` and `ready` look first: workers retried `gh pr create`
  by hand after a 502 that had opened it (command-decision-11)
- 2026-11-26 — `pr land` sends a conflict to the agent on the branch (`pane conflicted`, which
  sends `/pr-conflicts <n>`), waits on its push, 90 minutes across every hand-off, and lands it:
  six lands in a day were refused for conflicts, each relayed by main by hand at 10-15 minutes
  and a CI run
- 2026-11-28 — `pr wait` and `pr land` merge and push a conflict git merges cleanly themselves:
  GitHub ignores `merge=union` on `history.md`, and in 5 sessions a clean merge-tree was reported as
  `git could not name the files`, each costing a merge, a full check, a push and a CI run by hand
- 2026-11-28 — A pane's commands are a copy in userData, so a rebuild no longer reaches the panes
  of the running app before its restart: 16 "restart the app" refusals in a day
  (command-decision-12)
