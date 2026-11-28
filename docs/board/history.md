# Board: history

One line per merged change: date and why.

- 2026-09-05 #7 — A board becomes one of a project's modes
- 2026-09-06 #8 — Cards get a priority and a description
- 2026-09-06 #10 — Cards get subtasks
- 2026-09-08 #16 — A card carries its dates, its branch and its pull request
- 2026-09-13 #33 — A `board` command so agents can work the board (board-rule-1)
- 2026-09-15 #39 — A card keeps a comment trail, from the app and the command line
- 2026-09-15 #41 — Move a card with the mouse
- 2026-09-16 #46 — A read that fails is a failure, not an empty board
- 2026-09-16 #48 — A board nobody read refuses the keys, so it is never written over
- 2026-09-16 #49 — A fifth column, Review, for a card with a pull request open (board-rule-2)
- 2026-09-20 #57 — Search cards on the board
- 2026-10-14 #73 — Backlog column, board filter and a sort button
- 2026-11-02 #171 — An arrow key moves the highlight instead of rebuilding the board
- 2026-11-08 #245 — A Cancelled column: the delete key keeps a card that will not be done
  (board-decision-4)
- 2026-11-09 #261 — A card's column follows its pull request through gh, and the app writes the line
  naming it (board-decision-6)
- 2026-11-09 #266 — A card shows its pull request's checks and review as one glyph
  (board-decision-9)
- 2026-11-09 #254 — Every write to a git-tracked board lands on origin's main, and the checkout is
  brought up to it (board-decision-5)
- 2026-11-09 #262 — A hook refuses an agent's hand edit of the board, and the app tells its sessions
  what to know; board-rule-2 becomes a decision (board-decision-7, board-decision-8)
- 2026-11-09 #282 — The seeded .dashboard/CLAUDE.md names the board command and stops
  (board-decision-8)
- 2026-11-16 #290 — The review pane merges and moves nothing; the app's follow moves the card into
  Done (board-decision-7)
- 2026-11-16 #305 — A board.json that breaks twice keeps both damaged copies
- 2026-11-17 #322 — A board change that cannot reach origin is refused in a worktree, and a dropped
  connection is retried (board-decision-5)
- 2026-11-17 #317 — The seeded .dashboard docs are rewritten whenever they are not the current text,
  and committed to origin by the board's sync where git tracks them; a feature branch's copy is left
  for its merge of main (board-decision-8)
- 2026-11-18 #327 — `board list` leaves out Done and Cancelled, a unique start of an id names its
  card, and the usage says no git pull is needed (board-decision-8)
- 2026-11-19 — A review refused before the app has seen the pull request says the card moves into
  Review once it does
- 2026-11-19 — `board show` lists the card's subtasks, since `list` prints no parent
- 2026-11-19 — A review start asks gh for the card's pull request before refusing that it has none
- 2026-11-24 — The board's sync and `create-task` use the project's own remote, not always origin,
  and the seeded docs (version 3) say so
- 2026-11-24 — A card on a GitLab project records its merge request the way a pull request is
  recorded, from `glab mr list`
- 2026-11-26 — An untracked file outside `.dashboard/` no longer stops the sync fast-forwarding the
  checkout: kamandsystem's untracked `.claude/` left each board write uncommitted there, and
  `git pull` refused over the card files
- 2026-11-26 — The drag's grab, column listeners and drop moved out of `board-view.ts` into
  `card-dragging.ts`: the view sat at 599 of 600 code lines, so the next board change would have had
  to split it first
- 2026-11-27 — The board-files tests of the folder got the 60 s timeout the file's other two blocks
  have: a Windows CI runner's disk stalled for seconds and took whichever test was running past
  vitest's 5 s. The three that write their own files start from an empty folder board as well
- 2026-11-28 — A short card id is made whole by the app's card actions as well as the command:
  `board review 6ad9d4f4` was told the card had no worktree when it had no pull request yet, and
  `board ship <id> --after 3a1ee233` found no card to wait on, where the whole ids worked
