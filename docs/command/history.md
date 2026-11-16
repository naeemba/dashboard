# Command: history

One line per merged change: date, pull request, why.

- 2026-11-01 #154 — One dashboard command with board and pane nouns (command-decision-1)
- 2026-11-04 — The dashboard command from any terminal: launcher, starting the app, --help, board --project, pane send, project focus (command-decision-2, command-decision-3, command-decision-4)
- 2026-11-16 — `dashboard pr land`: wait for the checks on the head commit, then merge that commit; `budget` left out (command-decision-5)
- 2026-11-16 — `dashboard budget`: the 7-day usage against `budget.weeklyCap`, stale or missing exits 2 (command-decision-6)
- 2026-11-16 — The app writes `~/.claude/usage-7d.json` from its Claude screens' measure, so `budget` reads fresh with no terminal statusline (command-decision-6)
- 2026-11-16 — `pr land` reads a failed merge back from the pull request: merged at the noted commit is merged, a network error is tried once more
