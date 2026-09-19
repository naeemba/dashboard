import { addComment, cardAt, moveCardById, reviewColumnIndex, selectionOf, type Board } from './board';
import { BOARD_FILE_PATH } from './board-store';
import { posixQuoted } from './shell';

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
// Null when the card already ends on this very line. The trail is append-only, and the one refusal the
// sweep retries is a dirty worktree — every five seconds, for as long as it stays dirty — so without
// this a worktree somebody abandoned mid-change would bury its own card under a copy of "uncommitted
// changes in ship-it" a tick. It matches the whole sentence, which is why that line carries no file
// count: a number in it changes as the agent saves, and every new number is a line this lets through.
export function reviewRefused(board: Board, cardId: string, reason: string): Board | null {
  const at = selectionOf(board, cardId);
  if (!at) return null;
  const line = `No review worktree: ${reason}`;
  if (cardAt(board, at)?.comments?.at(-1)?.body === line) return null;
  return addComment(board, at, line).board;
}

// What the review pane is asked to do. One prompt rather than a bare `/pr-loop`, because the loop
// stops at a report and the card wants the pull request landed — and because that last move, into
// Done, lands on two boards in an order that matters.
//
// The branch's board is the one the merge carries into main, so it is moved and pushed first, while
// the pull request is still open. The project's board is the running app's own copy, and it is moved
// after, once the merge has actually happened — before that there is nothing to show.
//
// Done in the other order, the merge carries whatever the branch happened to say, which is `Review`,
// and main goes on committing `Review` for a card that landed weeks ago. The only copy that says
// `Done` is then an uncommitted change in somebody's checkout, and it never becomes true for anyone
// else. This project's own board was found in exactly that state: `origin/main` saying `Review` for
// a merged card, the working tree saying `Done`, and the two never converging.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in: the worktree is a checkout of the branch, and its own .dashboard
// board is the branch's copy.
export function reviewPrompt(
  cardId: string, pullRequest: number, projectPath: string, title: string,
): string {
  const board = `cd ${posixQuoted(projectPath)} && node "$DASHBOARD_BOARD"`;
  // One command, so the move and the commit that makes it real cannot be separated. A board written
  // and left uncommitted is the whole of the bug above, and it is also what the sweep trips over when
  // it comes to take a worktree away.
  //
  // Safe to run twice, the way commitShipMove is and for the reason it gives: a card already in Done
  // stages nothing, and the commit would stop the chain before the push and before the merge — so a
  // review pane restarted after getting this far would leave a landable pull request sitting there,
  // reporting that git said no. Both halves name the board file, so a worktree that has been lived in
  // cannot have the agent's own staged work swept into a commit about a card.
  const file = `-- ${BOARD_FILE_PATH}`;
  const commit = `git commit -m ${posixQuoted(`board: "${title}" is done`)} ${file}`;
  const land = [
    `node "$DASHBOARD_BOARD" move ${cardId} Done`,
    `git add ${file}`,
    `{ git diff --cached --quiet ${file} || ${commit}; }`,
    'git push',
  ].join(' && ');
  return [
    `Review pull request #${pullRequest} and land it. It came from card ${cardId} on the board of ${projectPath}.`,
    '',
    `1. Run /pr-loop ${pullRequest} and let it finish.`,
    '2. If it ended converged or floor-addressed, with nothing above low left unresolved and no',
    '   conflict with the base branch, land it in this order and no other:',
    '',
    `   a. \`${land}\``,
    '',
    "      That is this branch's board, the one under this pane, and it is what the merge carries",
    '      into main. The column has to be right before the merge, not after: move it afterwards and',
    '      main commits `Review` for a card that has landed, and the only copy saying `Done` is an',
    "      uncommitted change in a checkout nobody else has.",
    '',
    `   b. \`gh pr merge ${pullRequest} --merge\`. Do not approve it: you are the author, and GitHub`,
    '      refuses an approval from the author. The pull request does not need one to merge.',
    '',
    `   c. \`${board} move ${cardId} Done\``,
    '',
    "      That is the project's own board — the running app's copy, not this branch's — and it is",
    '      what the card looks like on screen. Only after the merge, because before it there is',
    '      nothing to show. It now says what (a) just put on main, which is the point of that order.',
    '',
    '3. Any other ending — the loop stopped short, the merge was refused, the pull request conflicts —',
    "   is where you stop, and the card stays in Review on the project's board. If you already got",
    '   as far as (a), leave that commit where it is rather than undoing it: a column on a branch is',
    '   a claim about that branch and comes true only if it merges. Say what happened on the card:',
    `   \`${board} comment ${cardId} "<what happened>"\`.`,
    '',
    'Do not remove this worktree, and do not quit, kill or rebuild any running app.',
  ].join('\n');
}
