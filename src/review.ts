import { addComment, cardAt, moveCardById, reviewColumnIndex, selectionOf, type Board } from './board';

// Every decision the review makes that is not git's or Electron's: where a finished card goes, what is
// said on it when it cannot be reviewed, and what the pane that reviews it is asked to do. The steps
// themselves — removing a worktree, making another, taking a pane — are main's, beside the ship they
// are a second half of.

// The project's board with the card in Review, or null when there is nothing to move: a card already
// in Review, or a board somebody has taken the Review column out of.
//
// A card *past* Review is not one of those. This moves to a column by number, so a card sitting in Done
// is dragged back into Review with a pull request that merged last week. Nothing does that today only
// because reviewOne asks awaitsReview first and returns on false — the refusal is one line up the call,
// not here, and a second caller has to ask too.
//
// A card the board does not mention answers null, but the sweep cannot reach here with one:
// awaitsReview says null for it and reviewOne returns on that before the move is asked for. The only
// way this sees a missing card is the board changing between those two reads in the same tick.
export function intoReview(board: Board, cardId: string): Board | null {
  return moveCardById(board, cardId, reviewColumnIndex(board));
}

// Whether this card still wants reviewing, asked of the project's board. Its column is the only record
// of a review that finished: the review's whole job is to move the card past Review, and the worktree
// it ran in stays on disk afterwards — the prompt says not to remove it — so the record outlives the
// review and says nothing about how it ended.
//
// What asking the record instead costs. `reviewing` on it is a sentence about a pane, so it is cleared
// when the pane goes and a restart wipes it off every card. Without this, the first tick after that
// restart finds a card sitting in Done with a pull request number still on the branch's board, pulls it
// back into Review, re-cuts the worktree and runs `/pr-loop` at a pull request that merged last week.
//
// Null is the third answer, for a card this board does not mention, and it means "I cannot say" rather
// than "review it". Such a card cannot be one made on the branch: every worktree the sweep walks was cut
// from a card sitting on the project's board. It is a card that has left the board since — you deleted
// it once the review was done, or readBoard found a board.json it could not parse, moved it aside and
// handed back an empty board, which loses every card at once. Answer "review it" there and the first
// tick re-cuts the worktree and runs /pr-loop at a pull request that merged last week, with no card left
// anywhere to say so on. The sweep leaves a board it cannot open alone, and this is the same silence.
//
// A board somebody has taken Review out of is different, and still true: the card is there, and a board
// with no Review column cannot say a card is past a column it does not have.
export function awaitsReview(board: Board, cardId: string): boolean | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  const review = reviewColumnIndex(board);
  return review === -1 || at.column <= review;
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

// A path for a shell to read, in single quotes. A project folder is allowed a space in it, and an
// apostrophe too — `/Users/sharp/Bob's api`. Inside single quotes the only way to write one is to shut
// the quotes, escape it, and open them again, which is what the replace does.
function quotedPath(path: string): string {
  return `'${path.replaceAll("'", String.raw`'\''`)}'`;
}

// What the review pane is asked to do. One prompt rather than a bare `/pr-loop`, because the loop
// stops at a report and the card wants the pull request landed — and because the card's last move,
// into Done, has to happen on the project's board rather than on the branch the pane is sitting on.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in: the worktree is a checkout of the branch, and its own .dashboard
// board is the branch's copy.
export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string): string {
  const board = `cd ${quotedPath(projectPath)} && node "$DASHBOARD_BOARD"`;
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
