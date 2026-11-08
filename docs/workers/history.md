# Workers: history

One line per merged change: date, pull request, why.

- 2026-10-22 #76 — Resume each pane's Claude session after a restart
- 2026-10-29 #84 — A main session that dispatches tasks into worker panes (workers-decision-1)
- 2026-10-29 #85 — Fixed main pane, scrolling worker list, button and status row
- 2026-10-30 #93 — The project's main session is the Claude screen (workers-decision-1)
- 2026-10-30 #96 — Close a worker pane, or fold one to give its room to the others
- 2026-10-30 #97 — A new-pane button in the title row
- 2026-11-01 #135 — Session names use the shared slug instead of a second copy
- 2026-11-02 #176 — Main is told when its worker finishes; the who-ran-it record (workers-decision-1, workers-decision-3)
- 2026-11-02 #196 — A session request ends at its newline, not at a half close a Windows named pipe cannot do
- 2026-11-02 #195 — Workers start under Windows PowerShell: claude's words escaped for the program, --settings wrapped whole
- 2026-11-04 #203 — A pane command gives up on an app that never takes its request, and the app refuses another build (workers-decision-4)
- 2026-11-05 #209 — Main hears a worker stopped only after three minutes with no report, once per stop, as a status line (workers-decision-1)
- 2026-11-05 — Main hears a worker stopped at once when its Stop hook says nothing is in flight or scheduled, and a worker waiting on its own work is listed paused (workers-decision-1)
- 2026-11-05 — `pane run --screen` runs a worker as a Claude screen in its pane, opt-in, its done detection from its own Stop hook (workers-decision-5)
- 2026-11-06 — A worker screen's session runs in the screen host, so its turn goes on through an app restart (workers-decision-6)
- 2026-11-06 #224 — A worker screen asks permission as a terminal worker does: the user's allow rules, then a question in its box; the trial's `gh pr create` refusal was not reproduced (workers-decision-5)
- 2026-11-07 #228 — New Claude: the new-pane button splits into New Terminal and New Claude, which opens a Claude screen of your own, not main's worker (workers-decision-7)
- 2026-11-07 #227 — `pane run` starts a Claude screen by default; `--terminal` asks for Claude Code in the terminal, and Windows keeps the terminal (workers-decision-5)
- 2026-11-08 #233 — Every agent a pane starts goes through pane.dispatch: a ship and the review loop open a Claude screen off Windows too (workers-decision-8)
- 2026-11-08 — `pane release` takes back a stop notice still queued for the worker it releases, and a released screen worker's late hook no longer counts as the next one's (workers-decision-1)
