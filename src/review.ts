import { addComment, cardAt, moveCardById, reviewColumnIndex, selectionOf, type Board } from './board';

// Every decision the review makes that is not git's or Electron's: where a finished card goes, what is
// said on it when it cannot be reviewed, and what the pane that reviews it is asked to do. The steps
// themselves — removing a worktree, making another, taking a pane — are main's, beside the ship they
// are a second half of.

// The project's board with the card in Review, or null when there is nothing to move: a card already
// there, one that was made on the branch and has never been on the project's board, or a board
// somebody has taken the Review column out of.
export function intoReview(board: Board, cardId: string): Board | null {
  return moveCardById(board, cardId, reviewColumnIndex(board));
}

// The project's board with a line on the card saying why no review is running. The card is the only
// place the app can say it: a review starts on a timer rather than a keystroke, so there is no status
// bar waiting on an answer and nothing on screen that the failure belongs to.
//
// Null when the card already ends on this very line. The trail is append-only and the sweep tries each
// card once per run of the app, so without this the card grows another copy of "1 uncommitted file in
// ship-it" every time you restart, for as long as the worktree stays dirty.
export function reviewRefused(board: Board, cardId: string, reason: string): Board | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  const line = `No review worktree: ${reason}`;
  if (cardAt(board, at)?.comments?.at(-1)?.body === line) return null;
  return addComment(board, at, line).board;
}

// What the review pane is asked to do. One prompt rather than a bare `/pr-loop`, because the loop
// stops at a report and the card wants the pull request landed — and because the card's last move,
// into Done, has to happen on the project's board rather than on the branch the pane is sitting on.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in: the worktree is a checkout of the branch, and its own .dashboard
// board is the branch's copy. The path is quoted because a project folder is allowed a space in it.
export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string): string {
  const board = `cd '${projectPath}' && node "$DASHBOARD_BOARD"`;
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
