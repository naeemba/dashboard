# Processes: history

One line per merged change: date, pull request, why.

- 2026-11-09 #PR — Closing a project, and a dispatch that starts a pane's shell over, stop the scope the old shell ran in
- 2026-11-09 #256 — Claude screens' sessions (in the app and the screen host) and the manager's tasks run in scopes of their own under agents.slice (processes-decision-5)
- 2026-11-09 #255 — A pane's scope is stopped when the pane closes or is released, so what its shell detached ends with it
- 2026-11-09 #253 — Each pane's shell runs in a systemd scope of its own, agents capped under agents.slice (processes-decision-1 to 4)
