import { addComment, cardById, moveCardToColumn, reviewColumnIndex, selectionOf, type Board } from './board';

// Every decision the review makes that is not git's or Electron's. What counts as a card an agent has
// finished, where the card goes when it has, and what the pane that reviews it is asked to do. The
// steps themselves — removing a worktree, making another, taking a pane — are main's, beside the ship
// they are a second half of.

// The pull request a finished card left behind, or null when the card is not finished.
//
// Read off the worktree's own board, which is the copy the agent has been editing all along: the
// project's board says what has merged, and nothing about a card there changes while an agent works.
// The number is the whole signal. An agent that has opened a pull request has done the work, whatever
// column it left the card in and whatever it said about it — and one that never gets that far never
// writes the field, so a card that fails is left alone rather than reviewed.
export function finishedPullRequest(board: Board, cardId: string): number | null {
  return cardById(board, cardId)?.pullRequest ?? null;
}

// The project's board with the card in Review, or null when there is nothing to move: a card that was
// made on the branch and has never been on the project's board, or a board somebody has taken the
// Review column out of. Null rather than the board unchanged, so the caller can tell "already there"
// apart from "nowhere to put it" and skip the write.
export function intoReview(board: Board, cardId: string): Board | null {
  const at = selectionOf(board, cardId);
  const target = reviewColumnIndex(board);
  if (!at || target === -1 || at.column === target) return null;
  return moveCardToColumn(board, at, target).board;
}

// The project's board with a line on the card saying why no review is running. The card is the only
// place the app can say it: a review starts on a timer rather than a keystroke, so there is no status
// bar waiting on an answer and nothing on screen that the failure belongs to.
export function reviewRefused(board: Board, cardId: string, reason: string): Board | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  return addComment(board, at, `No review worktree: ${reason}`).board;
}

// What the review pane is asked to do. One prompt rather than a bare `/pr-loop`, because the loop
// stops at a report and the card wants the pull request landed — and because the card's last move,
// into Done, has to happen on the project's board rather than on the branch the pane is sitting on.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in: the worktree is a checkout of the branch, and its own .dashboard
// board is the branch's copy.
export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string): string {
  const board = `cd ${projectPath} && node "$DASHBOARD_BOARD"`;
  return [
    `Review pull request #${pullRequest} and land it. It came from card ${cardId} on the board of ${projectPath}.`,
    '',
    `1. Run /pr-loop ${pullRequest} and let it finish.`,
    '2. If it ended converged or floor-addressed, with nothing above low left unresolved and no',
    `   conflict with the base branch, approve it with \`gh pr review ${pullRequest} --approve\` and`,
    `   merge it with \`gh pr merge ${pullRequest} --merge\`.`,
    `3. Once it is merged, move the card to Done: \`${board} move ${cardId} Done\`.`,
    '4. Any other ending — the loop stopped short, the approval or the merge was refused, the pull',
    '   request conflicts — is where you stop. Leave the card in Review and say what happened on it:',
    `   \`${board} comment ${cardId} "<what happened>"\`.`,
    '',
    'Do not remove this worktree, and do not quit, kill or rebuild any running app.',
  ].join('\n');
}
