# Ship: decisions

Settled questions. Read the entry before re-litigating it.

## ship-decision-1: The review merges only when told to, and only on green CI

**The review worker lands its pull request only when merging is on: the
project's `autoMerge` in `projects.yaml` when its entry says one, settings
`review.autoMerge` otherwise, off by default. A missing `projects.yaml` follows
the setting, since no entry can be saying false; an unreadable one is off
whatever the setting says. Off, the worker stops once `/pr-loop` and CI are
done, merges nothing, moves nothing, says the ending on the card, and reports
the rounds, the fixes, what is open and the CI state to the project's main. On,
it runs `dashboard pr land`, which notes the head commit before the CI wait,
waits for CI to pass on it, and merges that commit only (`--match-head-commit`),
so a push during the wait is refused rather than merged.** The review used to
merge whenever the loop converged: #290 was landed that way on 2026-11-16 with
nobody's go-ahead, and two commits reached main with no review after them. A
merge cannot be taken back, so the default is the one where a person decides;
the CI wait is there because a fix pushed after the last review round had never
been checked when the old prompt merged it. The decision is `landsPullRequest`
in `projects-file.ts`, the prompt `reviewPrompt` in `review.ts`. (2026-11-16)

The merge went through `pr land` from 2026-11-17. The prompt had spelled the
steps out for the agent to run by hand, so a network error on `gh pr merge`
was a failure: #301 was reported failed though it had merged. The command
tries a network error once more and reads a failed merge call back from the
pull request (#304), and every review with merging on now gets that.

## ship-decision-2: The review waits on CI with one background watch

**`reviewPrompt` asks for `gh pr checks <n> --watch` run in the background, or
`pr land <n>` when merging is on, whose wait is that watch,
which wakes the agent when it exits, and for nothing else during the wait: no
`gh pr view` or `gh pr checks` by hand and no foreground `sleep`. A "no checks
reported" right after a push gets one more background
`sleep 60 && gh pr checks <n> --watch`; still none means the repository runs no CI. The watch asks
for the longest background limit, two hours, and one stopped at that limit is run again, not read as
a failed check.** The 2026-11-16 retro of thirty sessions found 166 hand polls of `gh pr view` and
`gh pr checks` in one new-crm manager session, and `sleep N; gh pr checks` refused six times,
because a foreground `sleep` is blocked. A ci-wait script was the other option and was not taken:
the prompt runs in every project's review worktree, where a script in this repository is not on
disk. A watch that hangs is covered by the worker's pause ceiling (docs/workers/decisions.md).
`/pr-loop` itself lives in the user's dotfiles and is not changed here. (2026-11-16)

## ship-decision-3: A ship writes no board on the branch

**A ship commits nothing to its branch. The card's column lives on origin's
main and only there: card.move puts it in Ship and publishes before the ship
cuts the branch, the agent's start moves it to Doing, and its pull request
moves it after that (board-decision-6).** Until 2026-11-17 every ship began its
branch with a `board: ship` commit setting the card's file to Ship. The pull
request carried that file, so its merge wrote the card back to Ship on main,
over the Doing or Review the app had moved it to, and a card in Ship is one the
app starts an agent for: #310 got a second agent for work already done, and
#317 and #318 carried the same commit that day. The first-ship and resumed-ship
tests in `ship-flow.test.ts` hold that the branch is left at origin's tip.
(2026-11-17)

## ship-decision-4: The app checks /pr-loop and does not bundle it

**`/pr-loop` stays in naeemba/claude-pr-loop, installed by its own `install.sh`;
the app only checks it. A review start with no `pr-loop.md` in
`~/.claude/commands` is refused with the install line, and a checkout that is
behind origin, a workflow copy that differs from the checkout's, a checkout file
`install.sh` links but `~/.claude` lacks, or a dangling link is a status-bar
notice saying what to run. Only `/pr-loop` is
checked: the `/mr-loop` a GitLab review runs (ship-decision-5) comes from the same
`install.sh`, and one it has not linked is an unlinked file the notice names.** Before 2026-11-17
nothing checked
it: a missing install sent a review worker into a command that did not exist,
and an out-of-date one ran old behaviour silently, most often after a
`git pull` in the checkout, which refreshes the linked commands but not the copied workflow.
Bundling the commands into the app was the other option and was not taken: the repository is used on
its own too, and a second copy would drift from it. The fetch runs at most once a day, read off the
checkout's `FETCH_HEAD`, so relaunching does not reach GitHub each time. `review-loop-install.ts`.
(2026-11-17)

## ship-decision-5: A project is on GitLab when its remote's host does not name github

**The forge is read from the URL of the remote the work goes to (chosenRemote): GitHub when its
host names github, GitLab otherwise. On GitLab the board follows `glab mr list`, read into gh's
shape so a merge request is recorded the way a pull request is; the review runs `/mr-loop`, notes
the head, waits with `glab ci status --wait` and merges with `glab mr merge --sha` on that head;
`/work-card` opens it with `glab mr create`.** Before 2026-11-24 every step asked gh, so a card
shipped on insta-experiences (GitLab on `git.arr.lan`) was worked and pushed, then `gh pr create`
answered that no remote points to a GitHub host, and the card sat in Doing with nothing to review.
Matching "gitlab" in the host was the other rule and was not taken: `git.arr.lan` does not say it.
The host alone is read, so a GitLab path such as `acme/github-sync` stays GitLab. A GitHub
Enterprise host without "github" in its name would read as GitLab. `pr wait` and `pr land` stay
gh's. `forge.ts`, `merge-request.ts`. (2026-11-24)

## ship-decision-6: A GitHub review runs pr-loop.js, not /pr-loop

**On GitHub the review prompt calls `~/.claude/workflows/pr-loop.js` with the Workflow tool and
does `/pr-loop`'s fixed steps itself: the draft flag and `Review loop started` in one call beside
the Workflow call, and `Review loop finished: <status>`, the ready flag and the wait or land chained
in one background call after it. `/pr-loop`'s install `cmp` is the review start's refusal
(`reviewLoopMissing`).** Through `/pr-loop` each of those steps was a turn: on 2026-11-26 twelve
review workers ran the same sequence by hand, about six turns a review past judging the rounds, and
seven armed a ScheduleWakeup nobody asked for. Changing `pr-loop.md` in claude-pr-loop was the other
option and was not taken here: that command is used on its own too, where nothing else marks the
pull request. The cost is a copy of its draft and comment steps in `review.ts`, which has to follow
a change to them there; `review-finished.ts` already reads the finish heading. GitLab's `/mr-loop`
has no such steps and is run as it is. `review.ts`, `review-loop-install.ts`. (2026-11-26)

## ship-decision-7: A worktree's board files are nothing to keep

**A change or a commit that touches only `.dashboard/board/` does not keep a worktree once
origin's default branch holds it: not from the throwaway sweep (`unfinishedWork`) or the leftover
sweep, after a fetch (`boardNotOnOrigin`). A removal from the list forces git past those files
alone (`workChanges`, `removalChanges`, `unpushedWork`).** Every board write, from a worktree too,
lands on origin's default branch (board-decision-5), so the worktree's copy is stale. Until
2026-11-26 both sweeps counted any change or unpushed commit as work, and five worktrees sat in
dashboard.worktrees/ from 2026-11-16: two on an uncommitted edit of their own card file, two on an
unpushed `board: ship "…"` commit, one a detached HEAD already on origin/main, which now answers to
the agents' rule (a day quiet, nothing unpushed). The rest of `.dashboard/` (notes) still counts.
Held means origin's default branch has, at its tip or anywhere in its history, the worktree's
version of each board file it changed, so a card's Review that origin has since moved to Done
counts. A board write whose sync failed is never lost to a sweep: a version origin never held, or a
fetch that fails, keeps the worktree, and the throwaway sweep's reason names the files. The cost:
such a worktree stays until someone looks. `d` on one in the list asks the same question after
its first confirm. When origin lacks a file, a second confirm names it and removes the worktree
anyway (`removalOf`'s `boardChecked`). It is asked only when uncommitted board files are what git
is forced past, and only about those: an unforced remove of a clean one loses no commit, and a
forced one keeps the branch. A worktree that also holds a work change is asked about both: the
second confirm names the changed files and the board files origin lacks. The check fetches origin
inside the project's queue, so the second question can take up to `FETCH_TIMEOUT` to appear,
and a ship started meanwhile waits behind it. A review's removal, the swap and the clear after a
merge, asks the same: origin lacking a file keeps the worktree, and the card's line names the files
and the way out: once the edit is kept, `git restore .dashboard/board` and `git clean -f
.dashboard/board` in the worktree, an added card file being untracked, then `board review <id>`
for a swap or `d` in the worktree list for a clear, which is asked once a run (since 2026-11-26). A
review removal that work changes refuse anyway is not asked, so the swap's retry every tick does not
fetch origin each time. The `board` command has written nothing to a worktree
since 2026-11-17, so these are card files a script or tool wrote past it, or ones in an older
worktree. A locked worktree, or one a
process stands in, is still kept. `ship.ts`, `board-on-origin.ts`, `finished-work.ts`,
`leftover-worktrees.ts`, `remove.ts`. (2026-11-26)
