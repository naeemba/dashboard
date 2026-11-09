import {
  addComment, CANCELLED_COLUMN, DOING_COLUMN, DONE_COLUMN, isColumnNamed, REVIEW_COLUMN, selectionOf, setBranch, setPullRequest,
  type Board, type Card,
} from '../../shared/board/board';

// Every decision behind a card's column following its pull request (board-decision-6): which cards are
// asked about, what `gh` answered, and what that does to the card. card.follow runs it; the sweep in
// pull-request-sweep.ts says when.

export type PullRequestState = 'OPEN' | 'MERGED' | 'CLOSED';
export type PullRequest = { number: number; state: PullRequestState; title: string; url: string };

// A Done card is asked about for this long after it last changed, then never again. Long enough to
// catch a card moved to Done before its pull request merged, which is how kamandsystem #19 sat in Done
// unmerged; short enough that the app's first run does not ask `gh` about every card ever finished.
export const DONE_FOLLOWED_MS = 24 * 60 * 60 * 1000;

// `gh pr list` for one branch, every state, newest first, with what the comments name.
export function pullRequestListArguments(branch: string): string[] {
  return ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,title,url', '--limit', '20'];
}

// The pull request a branch stands for, from `gh pr list`'s JSON: an open one first, since a branch
// whose first pull request was closed may have opened a second; otherwise the newest. Null when the
// branch has none yet. Throws on what is not JSON, which the sweep logs as gh failing.
export function latestPullRequest(json: string): PullRequest | null {
  const listed: unknown = JSON.parse(json);
  const pulls = (Array.isArray(listed) ? listed : []).filter(isPullRequest);
  return pulls.find((pull) => pull.state === 'OPEN') ?? pulls[0] ?? null;
}

function isPullRequest(value: unknown): value is PullRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { number, state, title, url } = value as Record<string, unknown>;
  return Number.isInteger(number) && (state === 'OPEN' || state === 'MERGED' || state === 'CLOSED')
    && typeof title === 'string' && typeof url === 'string';
}

// The three things the app says on a card, one per pull request and state. The first words are how
// the app knows it has said one already, so they never change: the title after them may.
const SAID = { OPEN: 'opened', MERGED: 'merged', CLOSED: 'closed without merging' } as const;

function saidPrefix(pullRequest: number, state: PullRequestState): string {
  return `Pull request #${pullRequest} ${SAID[state]}`;
}

export function pullRequestComment(pull: PullRequest): string {
  const back = pull.state === 'CLOSED' ? '; back to Doing' : '';
  return `${saidPrefix(pull.number, pull.state)}: ${pull.title} ${pull.url}${back}`;
}

function said(card: Card, pullRequest: number, state: PullRequestState): boolean {
  const prefix = saidPrefix(pullRequest, state);
  return (card.comments ?? []).some((comment) => comment.body.startsWith(prefix));
}

// Whether the app asks `gh` about this card at all. Not without a branch: a research card has none and
// main moves it as it always has. Not in Cancelled: it will not be done (board-decision-4). Not once
// its merge is on it: that is the last thing a pull request does. And a Done card only for a day after
// it last changed (DONE_FOLLOWED_MS). `branch` is the card's own, or its worktree's.
export function isFollowed(card: Card, column: string, branch: string | undefined, now: number): boolean {
  if (branch === undefined || isColumnNamed(column, CANCELLED_COLUMN)) return false;
  if (card.pullRequest !== undefined && said(card, card.pullRequest, 'MERGED')) return false;
  if (!isColumnNamed(column, DONE_COLUMN)) return true;
  const changed = card.updatedAt === undefined ? Number.NaN : Date.parse(card.updatedAt);
  return now - changed < DONE_FOLLOWED_MS;
}

// What a pull request does to its card. `board` is the card with the number, the branch and the line
// written, or null when none of that changed; `column` is where card.move takes it, or null to leave it.
export type FollowStep = { board: Board | null; column: string | null };

// Each state moves the card once, the first time the app sees it, and says so on the card, so a
// person who moves the card on afterwards is not overruled every tick. One exception: an open pull
// request takes a card out of Done every time, since Done says merged.
//
// - open: into Review.
// - merged: into Done.
// - closed unmerged: back to Doing, from Review or Done; from anywhere else it only says so.
export function followStep(board: Board, cardId: string, branch: string, pull: PullRequest | null): FollowStep {
  const at = selectionOf(board, cardId);
  if (at === null || pull === null) return { board: null, column: null };
  const card = board.columns[at.column].cards[at.card];
  const column = board.columns[at.column].name;
  const first = !said(card, pull.number, pull.state);
  let next = board;
  if (card.pullRequest !== pull.number) next = setPullRequest(next, at, pull.number).board;
  if (card.branch === undefined) next = setBranch(next, at, branch).board;
  if (first) next = addComment(next, at, pullRequestComment(pull)).board;
  return { board: next === board ? null : next, column: target(column, pull.state, first) };
}

function target(column: string, state: PullRequestState, first: boolean): string | null {
  const into = (name: string) => (isColumnNamed(column, name) ? null : name);
  if (state === 'OPEN') return first || isColumnNamed(column, DONE_COLUMN) ? into(REVIEW_COLUMN) : null;
  if (!first) return null;
  if (state === 'MERGED') return into(DONE_COLUMN);
  return isColumnNamed(column, REVIEW_COLUMN) || isColumnNamed(column, DONE_COLUMN) ? DOING_COLUMN : null;
}
