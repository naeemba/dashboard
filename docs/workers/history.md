# Workers: history

One line per merged change: date and why.

- 2026-10-22 #76 — Resume each pane's Claude session after a restart
- 2026-10-29 #84 — A main session that dispatches tasks into worker panes (workers-decision-1)
- 2026-10-29 #85 — Fixed main pane, scrolling worker list, button and status row
- 2026-10-30 #93 — The project's main session is the Claude screen (workers-decision-1)
- 2026-10-30 #96 — Close a worker pane, or fold one to give its room to the others
- 2026-10-30 #97 — A new-pane button in the title row
- 2026-11-01 #135 — Session names use the shared slug instead of a second copy
- 2026-11-02 #176 — Main is told when its worker finishes; the who-ran-it record
  (workers-decision-1, workers-decision-3)
- 2026-11-02 #196 — A session request ends at its newline, not at a half close a Windows named pipe
  cannot do
- 2026-11-02 #195 — Workers start under Windows PowerShell: claude's words escaped for the program,
  --settings wrapped whole
- 2026-11-04 #203 — A pane command gives up on an app that never takes its request, and the app
  refuses another build (workers-decision-4)
- 2026-11-05 #209 — Main hears a worker stopped only after three minutes with no report, once per
  stop, as a status line (workers-decision-1)
- 2026-11-05 — Main hears a worker stopped at once when its Stop hook says nothing is in flight or
  scheduled, and a worker waiting on its own work is listed paused (workers-decision-1)
- 2026-11-05 — `pane run --screen` runs a worker as a Claude screen in its pane, opt-in, its done
  detection from its own Stop hook (workers-decision-5)
- 2026-11-06 — A worker screen's session runs in the screen host, so its turn goes on through an app
  restart (workers-decision-6)
- 2026-11-06 #224 — A worker screen asks permission as a terminal worker does: the user's allow
  rules, then a question in its box; the trial's `gh pr create` refusal was not reproduced
  (workers-decision-5)
- 2026-11-07 #228 — New Claude: the new-pane button splits into New Terminal and New Claude, which
  opens a Claude screen of your own, not main's worker (workers-decision-7)
- 2026-11-07 #227 — `pane run` starts a Claude screen by default; `--terminal` asks for Claude Code
  in the terminal, and Windows keeps the terminal (workers-decision-5)
- 2026-11-08 #233 — Every agent a pane starts goes through pane.dispatch: a ship and the review loop
  open a Claude screen off Windows too (workers-decision-8)
- 2026-11-08 #241 — `pane release` takes back a stop notice still queued for the worker it releases,
  and a released screen worker's late hook no longer counts as the next one's (workers-decision-1)
- 2026-11-09 #258 — Work sent with `pane send`, a ship or the review loop reports to the main that
  sent it, and the app closes a finished worker's pane itself (workers-decision-1)
- 2026-11-09 #265 — A stop notice due while main is mid-turn waits for the turn to end, at most
  PAUSE_CEILING_MS from its start, and is dropped when that turn read the worker's report
  (workers-decision-1)
- 2026-11-09 #267 — `pane release` after a merge that took the throwaway worktree no longer fails as
  `spawn git ENOENT`: a folder already gone is neither asked about nor removed, and git's
  registration of one deleted by hand is pruned
- 2026-11-09 #283 — A killed screen host's sessions are ended before a worker starts again, neither
  host takes a live host's socket, and the app runs no worker itself while a host answers: one
  session per pane (workers-decision-6)
- 2026-11-09 #284 — A resumed conversation opens as what it last ran as: a screen stays a screen, a
  terminal a terminal, one of unknown kind pane run's default (workers-decision-8)
- 2026-11-16 #290 — Every session the app starts allows the pane, session and board commands in its
  own settings (workers-decision-9)
- 2026-11-16 — A review worker with merging off reports its rounds, fixes, open items and CI to main
  instead of merging (ship-decision-1)
- 2026-11-16 — A stop notice carries the end of the worker's last message, `pane report` prints it,
  and a turn you typed into a worker is not told to main (workers-decision-1)
- 2026-11-16 — `pane finish` releases a worker once its card is Done or its branch merged; main's
  prompt dispatches a card with `board ship` and waits with a wake-up, not a sleep loop
- 2026-11-16 — The finished-worker sweep closes a worker whose worktree's branch merged, as
  `pane finish` does, without waiting for a card or its grace period (workers-decision-1)
- 2026-11-16 — A card worker the finished-worker sweep closes still gets its review: the review
  start that found it at work no longer leaves its card marked as tried
- 2026-11-19 — Main's prompt names `dashboard --version` for the installed build, and every session
  may run it
- 2026-11-19 — Main asks the user before landing a pull request whose review loop changed what the
  card asked for or its design, and the review report says whether one did: a loop swapped a card's
  rule for its own heuristic and main landed it, relaying the change
- 2026-11-19 — Main's prompt names `project add` for work in a repository that is not a project yet:
  main ran such a change in a pane on its own page, working in another repository
- 2026-11-23 — A throwaway worktree is removed whenever its pane goes, unless it holds
  uncommitted changes or commits no remote has, and the launch sweeps the ones a restart left:
  new-crm kept 32 research worktrees, 25 GB, as never pushed or with no pull request
- 2026-11-24 — `pane list`, `report` and `release` work across builds of one major version: after an
  install main lost its panes to "restart the app" until a restart (workers-decision-4)
- 2026-11-25 — Workers close when main's own command puts their work in, `pr land` or a board move
  into Done or Cancelled, never on a timer: the sweep closed a pane the user still needed, and kept
  three paused review workers with their cards Done; `workers.closeAfterMinutes` is gone
  (workers-decision-1)
- 2026-11-26 — `pane status`: each pane with its card, branch, pull request, CI and last message,
  then open pull requests no pane holds, in one call: main made about 250 status calls rebuilding
  its state after its compactions (pane list, board list, gh pr list in turn)
- 2026-11-26 — `pane run --worktree` fetches its base twice and, failing both, starts on the last
  fetched base with a warning: one session met nine transient `Permission denied (publickey)`
  refusals and its agent wrote retry loops by hand
- 2026-11-26 — A throwaway worktree whose only changes or unpushed commits are the board's is
  removed when its worker goes, the board being a stale copy of origin's (ship-decision-7)
- 2026-11-26 — The workers popup opens just above the count, and the count shows a worker idle as
  soon as its agent exits rather than at the next hook mark
- 2026-11-26 — The app holds main's workers to a cap of 4 and queues a start past it (`pane
  start`, `board ship`, the review sweep), since only main kept count and the review sweep could
  push past it (workers-decision-11)
- 2026-11-26 — The finished-work tests build their bare origin and clones once and copy them per
  test: building them in every test took one past vitest's 5 s on the Windows CI job
- 2026-11-26 — A withdrawn card goes back to the column its move took it from, and a review
  retried by hand starts through the pane pool like every other start (workers-decision-11)
- 2026-11-26 — A card moved on the board screen goes back when withdrawn too: the screen names
  the column it came from on card:move (workers-decision-11)
- 2026-11-27 — A queued ship or review waits while a card file does not parse, instead of being
  dropped as not on the board: only the drain reads the board that strictly (workers-decision-11)
- 2026-11-27 — A worker at work with no hook for `workers.stallMinutes` (20) is shown stalled in
  `pane list` and `pane status`, and main is told once; it keeps its pane (workers-decision-13)
- 2026-11-27 — The workers popup lists main's queued starts under its workers and D withdraws
  one, and the settings screen has a Workers row for the cap: the queue was only `pane queue`'s
  to see, and the cap only settings.json's to change (workers-decision-11)
- 2026-11-27 — Workers are started with permissions.denyInsteadOfPrompting, so a call that would
  wait on a prompt is refused and shows in the report instead of holding a pool slot
  (workers-decision-12)
- 2026-11-27 — The pane pool caps main's workers per project (`workers.cap`, 4) and in all
  (`workers.totalCap`, 8), and a worker waiting only on CI gives its slot back until `pr wait` or
  `pr land` asks for it again: one busy project no longer queued another's cards, and a review
  loop's CI wait held a queued card for its whole length (workers-decision-11)
- 2026-11-27 — A terminal worker blocked on a question is marked from its OSC 7501 status: no hook
  fires for it, so it read as running until it stalled. A failed turn is left to the stall sweep,
  since blocked would take it out of the sweep and tell main nothing
- 2026-11-27 — Workers are started with idleCompaction false, so a worker paused on CI or a review
  loop is not compacted while it waits (workers-decision-12)
- 2026-11-27 — The workers popup and status line count mark a stalled worker, redrawn every minute:
  only `pane list` and `pane status` said it, so the popup called a hung worker `working`
  (workers-decision-13)
- 2026-11-27 — The stale-origin block of finished-work.test.ts has a 60 s timeout: a Windows
  runner's disk stall took one of its tests to 5005 ms on main, failing the release
