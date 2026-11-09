import { addComment, CANCELLED_COLUMN, cardAt, cardById, isColumnNamed, REVIEW_COLUMN, moveCardById, reviewColumnIndex, selectionOf, type Board } from '../../shared/board/board';
import { posixQuoted } from '../../shared/panes/shell';

// Every decision the review makes that is not git's or Electron's: where a finished card goes, what is
// said on it when it cannot be reviewed, and what the pane that reviews it is asked to do. The steps
// themselves — removing a worktree, making another, taking a pane — are main's, beside the ship they
// are a second half of.

// The project's board with the card in Review, or null when there is nothing to move: a card already
// in Review, or a board somebody has taken the Review column out of.
//
// A card *past* Review is not one of those. This moves to a column by number, so a card sitting in Done
// is dragged back into Review with a pull request that merged last week. Nothing does that today only
// because its one caller, the review start in review-flow.ts (`review`), asks awaitsReview first and
// refuses on false — the refusal is up the call, not here, and a second caller has to ask too.
//
// A card the board does not mention answers null. Neither caller reaches here with one: awaitsReview
// says null for it, and sweepOne returns on that before the move is asked for while `review` refuses.
// The only way this sees a missing card is the board changing between those reads.
export function intoReview(board: Board, cardId: string): Board | null {
  return moveCardById(board, cardId, reviewColumnIndex(board));
}

// The pull request card.follow found for this card, from the project's board: the number, only while the
// card sits in Review, which is where an open pull request put it (board-decision-6). The sweep's other
// sign that a card is finished, beside the number an agent wrote on its worktree's board, so an agent
// that only opened its pull request is reviewed too. Not from any other column: a card back in Doing
// after its pull request closed unmerged keeps that number, and a fresh ship of it has opened nothing yet.
export function followedPullRequest(board: Board, cardId: string): number | null {
  const at = selectionOf(board, cardId);
  if (at === null || !isColumnNamed(board.columns[at.column].name, REVIEW_COLUMN)) return null;
  return cardById(board, cardId)?.pullRequest ?? null;
}

// Whether the card sits in Cancelled. One of the reasons awaitsReview answers false, exported so the
// refusal of a review by hand can say this one by name rather than "its review has run".
export function isCancelled(board: Board, cardId: string): boolean {
  const at = selectionOf(board, cardId);
  return at !== null && isColumnNamed(board.columns[at.column]?.name ?? '', CANCELLED_COLUMN);
}

// Whether this card still wants reviewing, asked of the project's board. Its column is the only record
// of a review that finished: the review's whole job is to move the card past Review, and the worktree
// it ran in outlives it — the app removes it on a later tick once no shell stands in it, and not at
// all while the project is closed or git refuses — so the record says nothing about how the review ended.
//
// What asking the record instead costs. `reviewing` on it is a sentence about a pane, so it is cleared
// when the pane goes and a restart wipes it off every card. Without this, the first tick after that
// restart finds a card sitting in Done with a pull request number still on the branch's board, pulls it
// back into Review, re-cuts the worktree and runs `/pr-loop` at a pull request that merged last week.
//
// Null is the third answer, for a card this board does not mention, and it means "I cannot say" rather
// than "review it". Such a card cannot be one made on the branch: every worktree the sweep walks was cut
// from a card sitting on the project's board. It is a card that has left the board since — you deleted
// it once the review was done, or readBoard found its card file would not parse and set it aside, or
// found a board.json it could not parse, moved it aside and handed back an empty board, which loses
// every card at once. Answer "review it" there and the first
// tick re-cuts the worktree and runs /pr-loop at a pull request that merged last week, with no card left
// anywhere to say so on. The sweep leaves a board it cannot open alone, and this is the same silence.
//
// A board somebody has taken Review out of is different, and still true: the card is there, and a board
// with no Review column cannot say a card is past a column it does not have.
//
// A card in Cancelled is false wherever that column sits, even on an old board that has it in front of
// Review: it will not be done, so it is never pulled into Review. The sweep asks isCancelled before
// this and leaves its worktree alone (board-decision-4).
export function awaitsReview(board: Board, cardId: string): boolean | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  if (isCancelled(board, cardId)) return false;
  const review = reviewColumnIndex(board);
  return review === -1 || at.column <= review;
}

// The project's board with a line on the card saying why no review is running. The card is the only
// place the app can say it: a review starts on a timer rather than a keystroke, so there is no status
// bar waiting on an answer and nothing on screen that the failure belongs to.
//
// Null when the card already ends on this very line. The trail is append-only, and the one refusal the
// sweep retries is a dirty worktree — every five seconds, for as long as it stays dirty — so without
// this a worktree somebody abandoned mid-change would bury its own card under a copy of "uncommitted
// changes in ship-it" a tick. It matches the whole sentence, which is why that line carries no file
// count: a number in it changes as the agent saves, and every new number is a line this lets through.
export function reviewRefused(board: Board, cardId: string, reason: string): Board | null {
  return commentOnce(board, cardId, `No review worktree: ${reason}`);
}

// The project's board with a line on the card saying why its worktree is still on disk after the card
// reached Done. The same card-only reason as above, and the same once-only guard.
export function worktreeKept(board: Board, cardId: string, reason: string): Board | null {
  return commentOnce(board, cardId, `Worktree kept: ${reason}`);
}

function commentOnce(board: Board, cardId: string, line: string): Board | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  if (cardAt(board, at)?.comments?.at(-1)?.body === line) return null;
  return addComment(board, at, line).board;
}

// What the review pane is asked to do. One prompt rather than a bare `/pr-loop`, because the loop
// stops at a report and the card wants the pull request landed — and because that last move, into
// Done, has to come after the merge.
//
// The `board` command writes a board git tracks on origin's main itself and brings the project's
// checkout up to it (board-sync-git.ts), so one move after the merge is the card on main and on screen.
// Before the merge it would be main saying Done for a pull request that may yet be refused, which is
// how kamandsystem #19 sat in Done unmerged. The branch's own board is not moved: nothing the merge
// carries is about the card any more (board-decision-7).
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in.
export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string): string {
  const board = `cd ${posixQuoted(projectPath)} && node "$DASHBOARD_BOARD"`;
  return [
    `Review pull request #${pullRequest} and land it. It came from card ${cardId} on the board of ${projectPath}.`,
    '',
    `1. Run /pr-loop ${pullRequest} and let it finish.`,
    '2. If it ended converged or floor-addressed, with nothing above low left unresolved and no',
    '   conflict with the base branch, land it in this order and no other:',
    '',
    `   a. \`gh pr merge ${pullRequest} --merge\`. Do not approve it: you are the author, and GitHub`,
    '      refuses an approval from the author. The pull request does not need one to merge.',
    '',
    `   b. \`${board} move ${cardId} Done\``,
    '',
    "      The board command writes the card on origin's main and brings the project's checkout up to",
    '      it, so this one move is the card on main and on screen. Only after the merge: moved before',
    '      it, main says Done for a pull request that may still be refused.',
    '',
    '3. Any other ending — the loop stopped short, the merge was refused, the pull request conflicts —',
    "   is where you stop, and the card stays in Review. Say what happened on the card:",
    `   \`${board} comment ${cardId} "<what happened>"\`.`,
    '',
    'Do not remove this worktree yourself: this pane is in it. The app removes it once the card is',
    "in Done on the project's board and this pane has been closed. Do not quit, kill or rebuild any",
    'running app.',
  ].join('\n');
}
