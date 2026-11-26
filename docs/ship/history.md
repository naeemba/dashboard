# Ship: history

One line per merged change: date and why.

- 2026-09-11 #27 — Ship a card into its own worktree, with an agent in one of the panes
- 2026-09-14 #37 — Main says when the worktree record changes, so the renderer stops polling
- 2026-09-15 #42 — git's output keeps the blank column an unstaged change starts with
- 2026-09-16 #49 — A pr-loop worktree carries the pull request to merged
- 2026-09-18 #51 — The review pane merges the pull request instead of approving it
- 2026-09-19 #56 — A review that cannot take the worktree yet tries again
- 2026-09-28 #62 — A ship leaves main's board.json the way it found it
- 2026-10-05 #67 — The worktree list shows every git worktree: size, dirty, remove
- 2026-11-01 #135 — Branch names cut the shared slug (branchSlug) instead of owning their own
- 2026-11-08 #233 — A shipped card's agent and its review loop start through pane.dispatch, a Claude
  screen off Windows (workers-decision-8)
- 2026-11-16 #288 — A ship tells `/work-card` whether to bump the version, from projects.yaml
  (projects-decision-1)
- 2026-11-16 #290 — The review prompt no longer moves the card to Done (board-decision-7)
- 2026-11-16 — The review merges only with `review.autoMerge` or the project's `autoMerge` on, after
  CI passes on the head commit; off, it reports to main (ship-decision-1)
- 2026-11-16 #305 — A worktrees.json that breaks twice keeps both damaged copies
- 2026-11-16 — A review start refused because the agent was back at work, or its project closed, is
  tried again on a later tick instead of never (#300, #313)
- 2026-11-16 — A card in Review whose loop finished after the pull request's newest commit date is
  not reviewed again after a restart
- 2026-11-17 — A review with merging on lands through `pr land`, so a merge whose answer gh lost is
  read back instead of reported failed (#301, #304)
- 2026-11-17 — A ship no longer commits the card's Ship move onto its branch, whose merge put a
  finished card back in Ship (ship-decision-3)
- 2026-11-17 — A review start without `/pr-loop` installed is refused with the install line; a stale
  install is a notice (ship-decision-4)
- 2026-11-19 — A new worktree gets the frozen install its lockfile names, so its agent can run the
  checks at once
- 2026-11-19 — The review prompt says `pr land`'s `merged <n> at <sha>` line is the merge, so the
  worker runs no `gh pr view` after it
- 2026-11-19 — The review report says whether any round changed what the card asked for or its
  design, so main can ask before landing it
- 2026-11-20 — The review prompt says never to run tests in parallel or start a second run while one
  is going (workflow-decision-12)
- 2026-11-23 — A card reviewed in this run has its worktree removed once it reaches Done, not after
  a restart; a sweep removes merged, clean, unused worktrees the app has no record of
- 2026-11-23 — The leftover sweep also removes a workflow agent's worktree in `.claude/worktrees/`
  once it is clean, pushed, unused and a day quiet
- 2026-11-24 — A ship, `pane run --worktree`, the board's sync and `pr land`'s fast-forward use the
  project's own remote (origin, else the only one, else the one the local main tracks): a GitLab
  project on a remote called `gitlab` was refused as having no base, and its worktrees were made by
  hand
- 2026-11-24 — A card on a GitLab project is opened, followed and reviewed through glab and
  `/mr-loop`: `gh pr create` refused its remote and the card sat in Doing with nothing to review
- 2026-11-25 — With merging on, a review whose loop changed what the card asked for or its design
  stops before the merge and reports it to main: a #329-style swap of the card's rule would have
  landed with nobody asked, the gap #338 closed only where main lands
- 2026-11-26 — A GitHub review runs pr-loop.js directly and does `/pr-loop`'s draft flag, start
  and finish comments and CI wait in two fixed calls, with the install check moved into the
  review start's refusal: twelve review workers had spent about six turns each on those steps
- 2026-11-26 — The review prompt says to rerun only the failed files to tell a failure from load,
  since a full run now waits while another runs on the machine (workflow-decision-14)
- 2026-11-26 — The ship's fetch is stopped after 60 seconds like the throwaway's: it holds the
  project's queue, so a stalled connection left every later ship, review and `pane run --worktree`
  there waiting with no answer
- 2026-11-26 — A worktree holding only board changes or board-only commits, or detached on
  origin/main, is no longer kept by either sweep once origin's default branch holds those board
  files: five sat in dashboard.worktrees/ for ten days (ship-decision-7)
- 2026-11-26 — `d` in the worktree list asks before removing a worktree whose board edits never
  reached origin's default branch: one keypress lost a card edit made offline (ship-decision-7)
- 2026-11-26 — A ship and a review start through the pane pool, queued with no worktree while the
  worker cap is full (workers-decision-11)
