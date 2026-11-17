# Ship: decisions

Settled questions. Read the entry before re-litigating it.

## ship-decision-1: The review merges only when told to, and only on green CI

**The review worker lands its pull request only when merging is on: the
project's `autoMerge` in `projects.yaml` when its entry says one, settings
`review.autoMerge` otherwise, off by default. A missing `projects.yaml`
follows the setting, since no entry can be saying false; an unreadable one is
off whatever the setting says. Off, the worker stops once `/pr-loop` and CI are
done, merges nothing, moves nothing, says the ending on the card, and reports
the rounds, the fixes, what is open and the CI state to the project's main. On,
it runs `dashboard pr land`, which notes the head commit before the CI wait,
waits for CI to pass on it, and merges that commit only (`--match-head-commit`),
so a push during the wait is refused rather than merged.** The review used to merge whenever the loop
converged: #290 was landed that way on 2026-11-16 with nobody's go-ahead, and
two commits reached main with no review after them. A merge cannot be taken
back, so the default is the one where a person decides; the CI wait is there
because a fix pushed after the last review round had never been checked when
the old prompt merged it. The decision is `landsPullRequest` in
`projects-file.ts`, the prompt `reviewPrompt` in `review.ts`. (2026-11-16)

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
reported" right after a push gets one more background `sleep 60 && gh pr
checks <n> --watch`; still none means the repository runs no CI. The watch asks
for the longest background limit, two hours, and one stopped at that limit is
run again, not read as a failed check.** The
2026-11-16 retro of thirty sessions found 166 hand polls of `gh pr view` and
`gh pr checks` in one new-crm manager session, and `sleep N; gh pr checks`
refused six times, because a foreground `sleep` is blocked. A ci-wait script
was the other option and was not taken: the prompt runs in every project's
review worktree, where a script in this repository is not on disk. A watch that
hangs is covered by the worker's pause ceiling (docs/workers/decisions.md).
`/pr-loop` itself lives in the user's dotfiles and is not changed here.
(2026-11-16)

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
