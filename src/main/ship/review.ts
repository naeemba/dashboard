import { addComment, CANCELLED_COLUMN, cardAt, isColumnNamed, moveCardById, reviewColumnIndex, selectionOf, type Board } from '../../shared/board/board';
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

// The pull request card.follow found for this card, from the project's board: the number, while the
// card sits in Review or past it. card.follow puts it there when the pull request opens and moves the card
// to Done only after the merge (board-decision-6), so a number on a card in Done is the one that merged,
// and the sweep needs it to clear that card's worktree. The sweep's first sign that a card is finished,
// ahead of any number already on its worktree's board. Not before Review: a card back in Doing after its
// pull request closed unmerged keeps that number, and a fresh ship of it has opened nothing yet. Not in
// Cancelled, wherever that column sits, and not on a board with no Review column, which has no column to
// be in or past.
export function followedPullRequest(board: Board, cardId: string): number | null {
  const at = selectionOf(board, cardId);
  const review = reviewColumnIndex(board);
  if (at === null || review === -1 || at.column < review || isCancelled(board, cardId)) return null;
  return cardAt(board, at)?.pullRequest ?? null;
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
// restart finds a card sitting in Done with its pull request number on the card, pulls it back into
// Review, re-cuts the worktree and runs `/pr-loop` at a pull request that merged last week.
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
// stops at a report and the card wants either the pull request landed or the user told it is ready.
//
// `merge` is landsPullRequest's answer (projects-file.ts), off unless settings or the project's entry
// turn it on: #290 was merged by this prompt with nobody's go-ahead, and two commits reached main with
// no review after them. Off, the pane stops once the loop and CI are done and reports to the project's
// main and on the card, so the board says "ready to merge" or what is open after main's session is gone;
// the card waits in Review until the user merges it. On, it runs `pr land` (pull-request-cli.ts), not
// steps copied out of this prompt, so it gets the command's second try on a network error and its
// reading back of a merge call that failed: #301 was reported failed by a review that had merged it.
//
// The card is not moved: the app's follow (card.follow) moves it into Done once gh says merged, and
// writes it on origin's main through the same sync the `board` command uses (board-sync-git.ts). A move
// asked of the agent was one more chance of Done before the merge, which is how kamandsystem #19 sat in
// Done unmerged, and BOARD_INSTRUCTIONS tells every session the app starts not to move a branch card.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in.
// The longest background run a session may ask for, shared by every prompt that waits on CI.
export const LONGEST_BACKGROUND_RUN = 'run_in_background, timeout 7200000, the longest allowed';

export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string, merge: boolean): string {
  const board = `cd ${posixQuoted(projectPath)} && node "$DASHBOARD_BOARD"`;
  const sayOnCard = `\`${board} comment ${cardId} "<what happened>"\``;
  const report = [
    '2. Then, unless the loop stopped short or the pull request conflicts with the base branch,',
    `   wait for CI on the pull request's head commit: \`gh pr checks ${pullRequest} --watch\`, run in the`,
    `   background (${LONGEST_BACKGROUND_RUN}), so you are woken when it`,
    '   exits. A watch stopped at that time limit has not failed: run it once more. That is the whole wait: no',
    '   `gh pr view` or `gh pr checks` in between, and no foreground `sleep`, which is refused. Every check',
    '   must pass on the commit the pull request ends on, a commit pushed after the last review round',
    '   included. "No checks reported" right after a push means CI has not started: run',
    `   \`sleep 60 && gh pr checks ${pullRequest} --watch\` in the background once more, and only if there`,
    '   are still none does the repository run no CI.',
    '3. Do not merge it, and do not move the card: it stays in Review until the user merges.',
    '4. Whatever the ending, say it on the card, "converged, ready to merge" or what is still open:',
    `   ${sayOnCard}. Your report to main (the SendMessage asked for below) says how many rounds`,
    '   the loop ran, what each one fixed, what is still open, the CI state of the head commit, and',
    '   whether any round changed what the card asked for or its design, naming the change.',
  ];
  const land = [
    '2. If it ended converged or floor-addressed, with nothing above low left unresolved and no',
    `   conflict with the base branch, land it: \`node "$DASHBOARD_COMMAND" pr land ${pullRequest}\`, run in the`,
    `   background (${LONGEST_BACKGROUND_RUN}), so you are woken when it exits.`,
    '   It notes the head commit, waits for every check on it and merges that commit only, so a push',
    '   during the wait is refused rather than merged. A land stopped at that time limit has not failed:',
    '   run it once more, and so is a land that prints `nothing is merged, run it again`. That is the whole',
    '   wait and the whole merge: no `gh pr view`, `gh pr checks` or',
    '   `gh pr merge` by hand, and no foreground `sleep`, which is refused.',
    `3. A land that exits 0, printing \`merged ${pullRequest} at <sha>\`, is merged: that line is gh's merge itself,`,
    '   so do not run `gh pr view` afterwards to confirm it. Do not approve it: you are the',
    '   author, and GitHub refuses an approval from the author. The pull request does not need one to',
    '   merge. Do not move the card: the app moves it to Done once the merge is in.',
    '',
    '4. Any other ending — the loop stopped short, the land exited non-zero, the pull request conflicts —',
    '   is where you stop, and the card stays in Review. Say what happened on the card, with what the land',
    '   printed:',
    `   ${sayOnCard}.`,
  ];
  return [
    `Review pull request #${pullRequest}${merge ? ' and land it' : ''}. It came from card ${cardId} on the board of ${projectPath}.`,
    ...(merge ? [] : ['Merging is off for this project: the user lands the pull request, not you.']),
    '',
    `1. Run /pr-loop ${pullRequest} and let it finish.`,
    ...(merge ? land : report),
    '',
    'A layout check on the running app is done in the project\'s browser, the dashboard server\'s browser_ tools,'
      + ' never Playwright or Claude in Chrome.',
    'Never run tests in parallel, or start a second run while one is going.',
    'Do not quit, kill or rebuild any running app.',
  ].join('\n');
}
