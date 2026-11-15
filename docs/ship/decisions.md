# Ship: decisions

Settled questions. Read the entry before re-litigating it.

## ship-decision-1: The review merges only when told to, and only on green CI

**The review worker lands its pull request only when merging is on: the
project's `autoMerge` in `projects.yaml` when its entry says one, settings
`review.autoMerge` otherwise, off by default. A missing or unreadable
`projects.yaml` is off whatever the setting says. Off, the worker stops once
`/pr-loop` and CI are done, merges nothing, moves nothing, and reports the
rounds, the fixes, what is open and the CI state to the project's main. On, it
waits for CI to pass on the head commit and merges that commit only
(`--match-head-commit`).** The review used to merge whenever the loop
converged: #290 was landed that way on 2026-11-16 with nobody's go-ahead, and
two commits reached main with no review after them. A merge cannot be taken
back, so the default is the one where a person decides; the CI wait is there
because a fix pushed after the last review round had never been checked when
the old prompt merged it. The decision is `landsPullRequest` in
`projects-file.ts`, the prompt `reviewPrompt` in `review.ts`. (2026-11-16)
