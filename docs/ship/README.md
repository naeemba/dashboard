# Ship

Moving a card into Ship makes a branch and a worktree for it and starts an
agent in one of the project's panes. When the agent puts a pull request on the
card, a review takes the worktree and carries the pull request to merged. The
worktree list shows every git worktree of a project and removes them.

## Files

- Ship: `ship.ts`, `ship-flow.ts`, `ships-away.ts`, `branch-worktree.ts`
- Review: `review.ts`, `review-flow.ts`
- Worktrees: `worktree-store.ts`, `git-worktrees.ts`, `worktree-scan.ts`,
  `worktree-sizes.ts`, `worktree-rows.ts`, `worktree-view.ts`,
  `worktree-removal.ts`, `worktrees.css`

## Scenarios

- Given a card in Todo, when you move it into Ship, then a branch off origin's base and a worktree are made and an agent starts in a free pane.
- Given a ship, when it is done, then main's `board.json` is the way it found it.
- Given an agent set a pull request number, when the review cannot take the worktree yet, then it tries again instead of giving up.
- Given the review merged the pull request, when it finishes, then the card is moved to Done on the branch, then merged, then on the app's board.
- Given a worktree with modified files, when you remove it from the list, then the app says so instead of git's raw `fatal:`.

## Open questions

- An unreadable `worktrees.json` stops the launch instead of opening empty
  (errors-decision-2).
