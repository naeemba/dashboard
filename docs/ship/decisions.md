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
it notes the head commit before the CI wait, waits for CI to pass on it, and
merges that commit only (`--match-head-commit`), so a push during the wait is
refused rather than merged.** The review used to merge whenever the loop
converged: #290 was landed that way on 2026-11-16 with nobody's go-ahead, and
two commits reached main with no review after them. A merge cannot be taken
back, so the default is the one where a person decides; the CI wait is there
because a fix pushed after the last review round had never been checked when
the old prompt merged it. The decision is `landsPullRequest` in
`projects-file.ts`, the prompt `reviewPrompt` in `review.ts`. (2026-11-16)

## ship-decision-2: The review waits on CI with one background watch

**`reviewPrompt` asks for `gh pr checks <n> --watch` run in the background,
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
