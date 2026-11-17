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
behind origin, a workflow copy that differs from the checkout's, or a dangling
command link is a status-bar notice saying what to run. Only `/pr-loop` is
checked, since no review runs `/mr-loop`.** Before 2026-11-17 nothing checked
it: a missing install sent a review worker into a command that did not exist,
and an out-of-date one ran old behaviour silently, most often after a `git
pull` in the checkout, which refreshes the linked commands but not the copied
workflow. Bundling the commands into the app was the other option and was not
taken: the repository is used on its own too, and a second copy would drift
from it. The fetch runs at most once a day, read off the checkout's
`FETCH_HEAD`, so relaunching does not reach GitHub each time.
`review-loop-install.ts`. (2026-11-17)
