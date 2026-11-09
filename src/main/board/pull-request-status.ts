import { allCards, type Board } from '../../shared/board/board';
import type { PullRequestStatus } from '../../shared/board/pull-request-status';
import { merged, type PullRequest } from './pull-request-column';

// A pull request's glyph (board-decision-9), from the same `gh pr list` answer card.follow reads its
// column from: pullRequestListArguments asks for these fields too, so the glyph costs no second call.
// Held in memory, never written on the card: it changes every minute a check runs, and each write
// would be a commit pushed to origin.

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const RUNNING = new Set(['PENDING', 'EXPECTED']);

// Merged; else a failed check over a running one over the review over whether it can merge. Null for a
// closed pull request, and for an open one with nothing to say: conflicting, or waiting on a review.
export function pullRequestStatus(pull: PullRequest): PullRequestStatus | null {
  if (pull.state === 'MERGED') return 'merged';
  if (pull.state === 'CLOSED') return null;
  const { statusCheckRollup, reviewDecision, mergeable } = pull;
  const checks = (Array.isArray(statusCheckRollup) ? statusCheckRollup : []).map(checkState);
  if (checks.includes('failed')) return 'failed';
  if (checks.includes('running')) return 'running';
  if (reviewDecision === 'APPROVED') return 'approved';
  if (reviewDecision === 'REVIEW_REQUIRED' || reviewDecision === 'CHANGES_REQUESTED') return null;
  return mergeable === 'MERGEABLE' ? 'mergeable' : null;
}

// A check run says `status` and, once completed, `conclusion`; a commit status says only `state`.
function checkState(check: unknown): 'failed' | 'running' | 'passed' {
  const { status, conclusion, state } = (typeof check === 'object' && check !== null ? check : {}) as Record<string, unknown>;
  if (FAILED.has(String(conclusion ?? state))) return 'failed';
  if ((status !== undefined && status !== 'COMPLETED') || RUNNING.has(String(state))) return 'running';
  return 'passed';
}

export type PullRequestStatuses = {
  // What gh last said about a branch's pull request; true when that is not what it said before, so
  // main tells the board on screen to read again.
  record(projectPath: string, branch: string, status: PullRequestStatus | null): boolean;
  // Each card's glyph by id, for board:read. A card whose merge is on it is merged without asking,
  // which is how it still says so after a restart: it is never asked about again (followedBranch).
  of(projectPath: string, board: Board): Record<string, PullRequestStatus>;
};

// ponytail: a card that leaves the followed set (Cancelled, a day in Done) keeps its last glyph until
// the app restarts; forget on leaving if a stale one ever misleads.
export function pullRequestStatuses(): PullRequestStatuses {
  const known = new Map<string, PullRequestStatus | null>();
  const key = (projectPath: string, branch: string) => `${projectPath}\0${branch}`;
  return {
    record(projectPath, branch, status) {
      const changed = (known.get(key(projectPath, branch)) ?? null) !== status;
      known.set(key(projectPath, branch), status);
      return changed;
    },
    of(projectPath, board) {
      const shown: Record<string, PullRequestStatus> = {};
      for (const card of allCards(board)) {
        if (merged(card)) shown[card.id] = 'merged';
        else if (card.branch !== undefined) {
          const status = known.get(key(projectPath, card.branch));
          if (status) shown[card.id] = status;
        }
      }
      return shown;
    },
  };
}
