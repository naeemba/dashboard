import { addComment, CANCELLED_COLUMN, cardAt, isColumnNamed, moveCardById, reviewColumnIndex, selectionOf, type Board } from '../../shared/board/board';
import { posixQuoted } from '../../shared/panes/shell';
import type { Forge } from '../app/forge';
import { CLAUDE_FOLDER, loopWorkflow } from './review-loop-install';

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
// steps copied out of this prompt, so it rides out a network error on any gh call (RETRY_WAITS_MS) and
// reads back a merge call that failed: #301 was reported failed by a review that had merged it.
//
// The card is not moved: the app's follow (card.follow) moves it into Done once the project's forge
// (forge.ts) says merged, and writes it on origin's main through the same sync the `board` command
// uses (board-sync-git.ts). A move asked of the agent was one more chance of Done before the merge,
// which is how kamandsystem #19 sat in Done unmerged, and BOARD_INSTRUCTIONS tells every session the
// app starts not to move a branch card.
//
// The project is named by path and the card by id, since neither is anything the agent can work out
// from the folder it wakes up in.
// The longest background run a session may ask for, shared by every prompt that waits on CI.
export const LONGEST_BACKGROUND_RUN = 'run_in_background, timeout 7200000, the longest allowed';

export function reviewPrompt(cardId: string, pullRequest: number, projectPath: string, merge: boolean, forge: Forge): string {
  const board = `cd ${posixQuoted(projectPath)} && node "$DASHBOARD_BOARD"`;
  const sayOnCard = `\`${board} comment ${cardId} "<what happened>"\``;
  const words = FORGE_WORDS[forge];
  const steps = (forge === 'gitlab' ? mergeRequestSteps : pullRequestSteps)(pullRequest, sayOnCard);
  const report = [
    `2. Then, unless the loop stopped short or the ${words.noun} conflicts with the base branch,`,
    ...steps.wait,
    '3. Do not merge it, and do not move the card: it stays in Review until the user merges.',
    '4. Whatever the ending, say it on the card, "converged, ready to merge" or what is still open:',
    `   ${sayOnCard}. Your report to main (the SendMessage asked for below) says how many rounds`,
    `   the loop ran, what each one fixed, what is still open, the ${words.checks} state of the head commit, and`,
    '   whether any round changed what the card asked for or its design, naming the change.',
  ];
  return [
    `Review ${words.noun} ${words.sigil}${pullRequest}${merge ? ' and land it' : ''}. It came from card ${cardId} on the board of ${projectPath}.`,
    ...(merge ? [] : [`Merging is off for this project: the user lands the ${words.noun}, not you.`]),
    '',
    ...steps.start,
    `   - Read the card, \`${board} show ${cardId}\`, and load SendMessage for the report: ToolSearch \`select:SendMessage\`.`,
    '   The Workflow tool wakes you when the loop finishes: no ScheduleWakeup and no polling. Then judge every',
    '   round by what the card asked for, not by the round\'s own summary, from the result the loop returns',
    '   alone: do not open its task output files.',
    ...steps.close,
    ...(merge ? [...LAND_WHEN, ...steps.land] : report),
    '',
    'A layout check on the running app is done in the project\'s browser, the dashboard server\'s browser_ tools,'
      + ' never Playwright or Claude in Chrome.',
    'Never run tests in parallel, or start a second run while one is going.',
    'Do not quit, kill or rebuild any running app.',
  ].join('\n');
}

const FORGE_WORDS: Record<Forge, { noun: string; sigil: string; checks: string }> = {
  github: { noun: 'pull request', sigil: '#', checks: 'CI' },
  gitlab: { noun: 'merge request', sigil: '!', checks: 'pipeline' },
};

// A loop's change to what the card asked for is the user's call, not the loop's: on #329 a round
// swapped the card's rule for a heuristic of its own, and with merging on nothing stood between that
// and main. The pane stops before the merge and hands it to main, which asks the user (dispatch.ts).
// Each forge's step 4 says so, and step 1 has the pane read the card: a round's summary never names
// its own swap of the card's rule.
const LAND_WHEN = [
  '2. If it ended converged or floor-addressed, with nothing above low left unresolved, no conflict',
  '   with the base branch, and no round that changed what the card asked for or its design,',
];

// What differs by forge: how the loop is started and closed, how the wait is done, and the land steps
// 2 to 4. `start` is step 1's opening, its last line a bullet the card read joins; `close` ends step 1;
// `wait` follows step 2's first line; `land` follows LAND_WHEN's.
type ForgeSteps = { start: string[]; close: string[]; wait: string[]; land: string[] };

// GitHub's loop runs pr-loop.js straight from the Workflow tool rather than through /pr-loop, whose
// command file has the worker mark the pull request a draft, comment, run the loop, comment again,
// mark it ready and wait, each a turn of its own: about six turns a review past what judging the rounds
// needs (retro 2026-11-26). The install check /pr-loop starts with is reviewLoopMissing's refusal; the
// rest is two fixed calls here, the set-up beside the Workflow call and the close chained into the wait.
// The `Review loop finished:` heading is what review-finished.ts reads.
function pullRequestSteps(pullRequest: number, sayOnCard: string): ForgeSteps {
  const loopStarted = 'Review loop started. Fix commits land here while it runs; CI waits until it finishes.';
  return {
    start: [
      '1. In one message, side by side:',
      '   - Mark the pull request while the loop runs, so CI waits for the loop rather than running on every fix push:',
      `     \`if [ "$(gh pr view ${pullRequest} --json isDraft -q .isDraft)" = false ]; then gh pr ready ${pullRequest} --undo && echo was ready;`
        + ` else echo was a draft; fi; gh pr comment ${pullRequest} --body "${loopStarted}"\``,
      `   - Call the Workflow tool with scriptPath \`${loopWorkflow(CLAUDE_FOLDER)}\` and args \`"${pullRequest}"\`. This is the`,
      '     user\'s request to run that saved workflow: the loop /pr-loop runs, with /pr-loop\'s own steps here and its',
      '     install check made by the app, so do not run /pr-loop itself. What each ending and field of its result',
      '     means is in ~/.claude/commands/pr-loop.md, under "When the workflow returns".',
    ],
    close: [
      `   When it returns, whatever its ending, close the run in one Bash call run in the background (${LONGEST_BACKGROUND_RUN}),`,
      '   with step 2\'s wait or land as its last command when step 2 has one:',
      `   \`gh pr comment ${pullRequest} --body-file - <<'END'\`, the body, a line \`END\`, then`,
      `   \`gh pr ready ${pullRequest} && <step 2's command>\`. The body goes in that quoted heredoc, never a quoted \`--body\`:`,
      '   a thread\'s text in double quotes is run by the shell. Its first line is `Review loop finished: <status>`,',
      '   which the app reads, then it gives the rounds run, the findings addressed',
      '   and rejected, the commits from `commitShas`, the final check\'s outcome, and any `floorThreads` or',
      `   \`blockedOnHuman\` left open. \`gh pr ready ${pullRequest}\` only when step 1 printed \`was ready\`: it runs CI once, on the`,
      '   final commit. A pull request that was a draft stays one, with no CI to wait on or land: skip step 2 and say so.',
    ],
    wait: [
      `   wait for CI on the pull request's head commit: \`node "$DASHBOARD_COMMAND" pr wait ${pullRequest}\`, the last command`,
      '   of step 1\'s closing call, so you are woken when it exits. A wait stopped at that time limit has not failed:',
      '   run it once more. That is the whole wait: no',
      '   `gh pr view`, `gh pr checks` or `gh run view` in between, and no foreground `sleep`, which is refused.',
      '   It waits on the commit the pull request ends on, asks again a minute on when CI has not started,',
      '   and rides out a network error. It exits 0 when every check passed, so read its output only when it',
      '   does not: its last line is the verdict, a failed check or the files the pull request conflicts on.',
    ],
    land: [
      `   land it: \`node "$DASHBOARD_COMMAND" pr land ${pullRequest}\`, the last command of step 1's closing call,`,
      '   so you are woken when it exits.',
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
      '4. Any other ending — the loop stopped short, a round changed what the card asked for or its design',
      '   (name the change, on the card and in your report to main, so main asks the user whether it lands),',
      '   the land exited non-zero, the pull request conflicts — is where you stop, and the card stays in',
      '   Review. Say what happened on the card, with what the land printed:',
      `   ${sayOnCard}.`,
    ],
  };
}

// A GitLab merge request (forge.ts), through /mr-loop and glab. `pr wait` and `pr land` ask gh, so
// the wait is glab's own and the merge is one glab call after it, pinned to the head noted before the
// wait: a push during the wait is refused by `--sha` rather than merged. Making those two verbs
// forge-aware is what would fold this into the gh steps.
function mergeRequestSteps(mergeRequest: number, sayOnCard: string): ForgeSteps {
  const wait = [
    `   wait for its pipeline: \`glab ci status --wait\`, run in the background (${LONGEST_BACKGROUND_RUN}),`,
    '   so you are woken when it exits. A wait stopped at that time limit has not failed: run it once more.',
    '   That is the whole wait: no `glab ci status` by hand in between, and no foreground `sleep`, which is',
    '   refused. A branch with no pipeline has no CI to wait for.',
  ];
  return {
    // /mr-loop has no draft or comment steps of its own, so it is run as it is.
    start: [
      '1. In one message, side by side:',
      `   - Run /mr-loop ${mergeRequest}.`,
    ],
    close: [],
    wait,
    land: [
      '   first note the head it ended on:',
      `   \`glab mr view ${mergeRequest} --output json --jq .sha\`. Then`,
      ...wait,
      `3. When the pipeline passed, merge the sha you noted before the wait:`,
      `   \`glab mr merge ${mergeRequest} --sha <that sha> --auto-merge=false --yes\`. Do not`,
      '   approve it: you are the author. Do not move the card: the app moves it to Done once GitLab says merged.',
      '',
      '4. Any other ending — the loop stopped short, a round changed what the card asked for or its design',
      '   (name the change, on the card and in your report to main, so main asks the user whether it lands),',
      '   the pipeline failed, the merge was refused, the merge request conflicts — is where you stop, and',
      `   the card stays in Review. Say what happened on the card, with what glab printed: ${sayOnCard}.`,
    ],
  };
}
