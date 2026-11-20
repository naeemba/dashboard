# Processes: history

One line per merged change: date and why.

- 2026-11-20 — A main session's scope is stopped when the app quits or is
  killed, and the next launch stops what an earlier one left, so a worker's
  report never reaches an orphaned main (processes-decision-6)
- 2026-11-16 #297 — A pane whose scope its close could not stop is a warning in
  the log, as the close key shows nothing (#259)
- 2026-11-09 #268 — Each pane's and session's memory read from its scope every
  five seconds, shown on the manager's rows and the status bar; the screen host
  answers each kept session's unit
- 2026-11-09 #260 — Enter on an exited pane (pane.restart) and a kept shell
  pane.restore does not take back stop the old shell's scope
- 2026-11-09 #257 — Closing a project, and a dispatch that starts a pane's shell
  over, stop the scope the old shell ran in
- 2026-11-09 #256 — Claude screens' sessions (in the app and the screen host)
  and the manager's tasks run in scopes of their own under agents.slice
  (processes-decision-5)
- 2026-11-09 #255 — A pane's scope is stopped when the pane closes or is
  released, so what its shell detached ends with it
- 2026-11-09 #253 — Each pane's shell runs in a systemd scope of its own, agents
  capped under agents.slice (processes-decision-1 to 4)
