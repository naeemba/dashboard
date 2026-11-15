# Ship

Moving a card into Ship makes a branch and a worktree for it and starts an
agent in one of the project's panes. When the agent puts a pull request on the
card, a review takes the worktree and carries the pull request to merged. The
worktree list shows every git worktree of a project and removes them.
Handing a card to its agent moves it into Doing with its branch on it, and from
then its pull request moves it (board-decision-6).

## Files

Folders: `src/main/ship/`, `src/shared/ship/`, `src/renderer/ship/`.

- Ship: `ship.ts`, `ship-flow.ts`, `ships-away.ts`
- Review: `review.ts`, `review-flow.ts`
- Worktrees: `worktree-store.ts`, `worktree-keeper.ts`, `worktree-channels.ts`, `git-worktrees.ts`, `worktree-scan.ts`,
  `worktree-sizes.ts`, `worktree-rows.ts`, `worktree-view.ts`,
  `worktree-removal.ts`, `worktrees.css`

Started by the card.ship and card.review actions (docs/actions), which are what
a move into Ship or Review, and `dashboard board ship` and `review`, call. The
agent itself, and the review's, is started by pane.dispatch: a Claude screen
off Windows, Claude Code in the terminal on it (workers-decision-8). Every
worktree, a ship's, a review's or a throwaway's, is made by worktree.make and
removed by worktree.remove; the record naming a card's pane is written by the
keeper's `givePane`, whichever door started the agent.

The agent is started on `/work-card <card id> bump-version|keep-version <base branch>`
(`workPrompt`), the skill the app installs ([skills](../skills/README.md#work-card)).
The second word is the project's `bumpVersion` in `projects.yaml`, read at each
ship, `keep-version` unless it says `true` (projects-decision-1). The third is the
branch the worktree was cut from, which a bump merges in first.

## Scenarios

- Given a card in Todo, when you move it into Ship, then a branch off origin's base and a worktree are made and an agent starts in a free pane, on a Claude screen off Windows.
- Given a ship, when it is done, then main's `board.json` is the way it found it.
- Given a project whose `projects.yaml` entry has no `bumpVersion`, when a card ships, then its agent is started on `/work-card <id> keep-version <base>` and leaves the version alone.
- Given an agent set a pull request number, when the review cannot take the worktree yet, then it tries again instead of giving up.
- Given the review merged the pull request, when the app next asks gh about the card, then the app moves it to Done on origin's main and on screen; the review pane moves no card (board-decision-7).
- Given a worktree with modified files, when you remove it from the list, then the app says so instead of git's raw `fatal:`.

## Known limits

- An unreadable `worktrees.json` stops the launch instead of opening empty
  (errors-decision-2).
