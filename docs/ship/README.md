# Ship

Moving a card into Ship makes a branch and a worktree for it and starts an
agent in one of the project's panes. When the agent puts a pull request on the
card, a review takes the worktree and runs `/pr-loop` on the pull request, then
merges it on green CI only when merging is on (ship-decision-1). The
worktree list shows every git worktree of a project and removes them.
Handing a card to its agent moves it into Doing with its branch on it, and from
then its pull request moves it (board-decision-6).

## Files

Folders: `src/main/ship/`, `src/shared/ship/`, `src/renderer/ship/`.

- Ship: `ship.ts`, `ship-flow.ts`, `ships-away.ts`
- Review: `review.ts`, `review-flow.ts`, `review-finished.ts`, `review-loop-install.ts`
- Worktrees: `worktree-store.ts`, `worktree-keeper.ts`, `worktree-channels.ts`, `git-worktrees.ts`,
  `worktree-scan.ts`, `worktree-sizes.ts`, `worktree-rows.ts`, `worktree-view.ts`,
  `worktree-removal.ts`, `worktrees.css`, `leftover-worktrees.ts`, `leftover-sweep.ts`

Started by the card.ship and card.review actions (docs/actions), which are what a move into Ship or
Review, and `dashboard board ship` and `review`, call. The agent itself, and the review's, is
started by pane.dispatch: a Claude screen off Windows, Claude Code in the terminal on it
(workers-decision-8). Every worktree, a ship's, a review's or a throwaway's, is made by
worktree.make and removed by worktree.remove; the record naming a card's pane is written by the
keeper's `givePane`, whichever door started the agent. Once the worktree is added, worktree.make
runs the project's frozen install, picked by its lockfile (`pnpm install --frozen-lockfile`,
`npm ci`, and yarn's and bun's `install --frozen-lockfile`), on the PATH the login shell builds
(`src/main/app/shell-path.ts`, as a Claude screen's session gets), so the agent can run the checks
straight away. An install that fails, or runs past five minutes (logged as
`stopped after 5 minutes`), is a warning in the log, with ten lines of what the install printed on
stdout and stderr from the first that names an error (pnpm says why on stdout, npm at the top of
stderr above its help); the worktree stays.

The agent is started on
`/work-card <card id> bump-version|keep-version <base branch> <remote>`
(`workPrompt`), the skill the app installs ([skills](../skills/README.md#work-card)).
The second word is the project's `bumpVersion` in `projects.yaml`, read at each
ship, `keep-version` unless it says `true` (projects-decision-1). The third is the
branch the worktree was cut from, which a bump merges in first, and the fourth the
remote it is on.

The remote is not always origin: it is origin when there is one, else the only
remote, else the one the local main (then master) tracks (`chosenRemote`). Never
the checked-out branch's upstream, so trying a branch from another remote does not
move the board and the base there. The base is that remote's
`HEAD`, else main, else master (`baseBranch`). A project whose base is none of
those names it with `dashboard project set <name> --base <branch>`, which sets
`<remote>/HEAD`. The worktree is cut from `<remote>/<base>`, and the board's sync
and `pr land`'s fast-forward use the same remote.

The review agent is started on `reviewPrompt`. Whether it may merge is
`landsPullRequest`, read at each review start: the project's `autoMerge` in
`projects.yaml` when its entry says one, settings `review.autoMerge` (the
settings screen's Merge row under Review, off by default) otherwise or when
there is no file, and off when the file does not read. Off, it runs the loop,
waits for CI, says the ending on the card and reports to the project's main; on,
it lands the pull request with `dashboard pr land` ([command](../command/README.md)),
which merges the head commit it noted before the CI wait (ship-decision-1).

`/pr-loop` is not the app's: it comes from a checkout of
naeemba/claude-pr-loop, whose `install.sh` links its commands into
`~/.claude/commands` and copies its workflow into `~/.claude/workflows`
(ship-decision-4). A review start with no `~/.claude/commands/pr-loop.md` (or one
linking to a checkout that has gone) is refused, on the card too, with the install
line. At launch and at each review start the app asks the checkout whether it is
current, and says on the status bar, until dismissed or a later check finds it
fixed, what to run when it is behind origin's default branch (fetched at most once
a day), when an installed workflow differs from the checkout's, when a file
`install.sh` links (`commands/`, `review/`, `scripts/`) has nothing in
`~/.claude`, or when a link there points at a file the checkout no longer has
(`review-loop-install.ts`).

The CI wait is one command the agent runs in the background, woken when it exits,
never a poll by hand or a foreground `sleep` (ship-decision-2): `gh pr checks <n> --watch`
with merging off, `pr land` with it on.

## Scenarios

- Given a card in Todo, when you move it into Ship, then a branch off origin's base and a worktree
  are made and an agent starts in a free pane, on a Claude screen off Windows.
- Given a ship, when it is done, then main's `board.json` is the way it found it.
- Given a project with a lockfile, when a worktree is made for it, then the frozen install its
  lockfile names has run there, and a failed one is logged with the worktree kept (`make.test.ts`).
- Given a card moved into Ship, when its ship makes the branch, then the branch has no commit of its
  own and its card file is origin's, so the merge never moves the card (ship-decision-3;
  `ship-flow.test.ts`).
- Given a project whose `projects.yaml` entry has no `bumpVersion`, when a card ships, then its
  agent is started on `/work-card <id> keep-version <base> <remote>` and leaves the version alone.
- Given a project whose only remote is `gitlab`, when a card ships or `pane run --worktree` runs,
  then the worktree is cut from `gitlab/<base>` rather than refused for having no origin
  (`ship-flow.test.ts`, `make.test.ts`).
- Given an agent set a pull request number, when the review cannot take the worktree yet, then it
  tries again instead of giving up.
- Given the sweep saw a card's agent stopped, when the review start finds it back at work (it
  stopped for its background agents), then nothing is marked and a later tick starts the review,
  after its pane closes too (#300, #313; `review-flow.test.ts`).
- Given merging is off and a card waits in Review after its loop posted `Review loop finished:` on
  the pull request, when the app restarts, then no second review starts unless the pull request
  carries a commit dated after that comment (its committer date, not when it was pushed)
  (`review-finished.ts`, `review-flow.test.ts`).
- Given merging is off (the default), when the review loop and CI finish, then the review merges
  nothing, the card stays in Review with the ending in a comment on it, and the project's main hears
  the rounds, the fixes, what is open, the CI state, and whether a round changed what the card
  asked for or its design.
- Given settings `review.autoMerge` is on but the project's entry says `autoMerge: false`, when its
  card is reviewed, then nothing is merged; the entry wins either way, and a folder the file does
  not list follows the setting.
- Given merging is on and a fix was pushed after the last review round, when the loop ends, then the
  review runs `pr land`, which waits for CI on that commit and merges it with `--match-head-commit`;
  a failed check stops it with a comment on the card.
- Given merging is on and `gh pr merge` loses its answer to a network error after the merge went
  through, when `pr land` reads the pull request back, then the review reports it merged, not failed
  (#301).
- Given merging is on and the network drops while `pr land` waits on the checks, when it exits
  printing `nothing is merged, run it again`, then the review runs it once more instead of stopping.
- Given merging is on, when `pr land` exits printing `merged <n> at <sha>`, then the review takes
  that line as the merge and runs no `gh pr view` to confirm it.
- Given the review merged the pull request, when the app next asks gh about the card, then the app
  moves it to Done on origin's main and on screen; the review pane moves no card (board-decision-7).
- Given no `~/.claude/commands/pr-loop.md`, when a review would start, then it is refused with
  `git clone … && ./install.sh`, the line is on the card, and the worktree is left as it was
  (`review-flow.test.ts`).
- Given the claude-pr-loop checkout was pulled but `install.sh` not rerun, when the app starts or a
  review starts, then the status bar says the installed workflow differs and to run `./install.sh`
  in the checkout (`review-loop-install.test.ts`).
- Given a `worktrees.json` that does not parse, when the app reads it, then it is moved aside as
  `worktrees.json.broken` (`worktrees.json.2.broken` and on if that name is taken) and the list
  opens empty (`worktree-store.test.ts`).
- Given a worktree with modified files, when you remove it from the list, then the app says so
  instead of git's raw `fatal:`.
- Given a card whose review the sweep started, when the card reaches Done in the same run, then its
  worktree is removed without a restart (`review-flow-clearing.test.ts`).
- Given a worktree under `<project>.worktrees/` that the app has no record of and no throwaway
  marker (a record lost, or a throwaway older than the marker), when its branch's pull request
  merged at its HEAD, nothing in it is uncommitted, and no process on the machine stands in it,
  then the leftover sweep removes it, a minute after launch and every half hour after, with the
  branch kept. Any other answer, or gh failing, keeps it (`leftover-worktrees.test.ts`).
- Given a leftover worktree that is locked (`git worktree lock`), then the sweep keeps it; given one
  git refuses to remove unforced (submodules), then the sweep does not ask again until the app
  restarts (`leftover-worktrees.test.ts`).
- Given a marked throwaway, then the leftover sweep leaves it to worktree.sweep and its pane
  (`leftover-worktrees.test.ts`).
- Given a workflow agent's worktree under `<project>/.claude/worktrees/wf_*`, when nothing in it is
  uncommitted or untracked, every commit HEAD reaches is on a remote, no process stands in it, and
  neither the folder nor git's index or HEAD for it changed in 24 hours, then the same sweep removes
  it. Anything else keeps it, and so does any other name there, such as a `claude --worktree`
  session's (`leftover-worktrees.test.ts`).

## Known limits

- An unreadable `worktrees.json` stops the launch instead of opening empty
  (errors-decision-2).
