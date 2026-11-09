import type { Board } from '../../shared/board/board';
import { blockingChanges } from '../ship/ship';
import { cardMoves } from './card-moves';

// Every decision the board's git sync makes. board-sync-git.ts runs the git and touches the files and
// has no decision in it; docs/board/README.md says what the sync is for (board-decision-5).

// A push refused because origin moved between the fetch and the push is fetched and tried again, up
// to this many tries in all. Two writers landing in the same second is the case; a third try losing
// as well is something else, and the board is left written here with a warning.
export const PUSH_ATTEMPTS = 3;

// Long enough for a slow network, short enough that a `board move` on a train answers in seconds.
export const FETCH_TIMEOUT = 10_000;
export const PUSH_TIMEOUT = 30_000;

// What a project's checkout is, as git says it, when the sync is done: the branch it stands on (null
// when detached), whether HEAD is the commit the sync left origin's default branch at, whether HEAD is
// an ancestor of it, and `git status --porcelain`.
export type CheckoutState = {
  branch: string | null;
  defaultBranch: string;
  current: boolean;
  behind: boolean;
  porcelain: string;
};

// What becomes of the checkout. `current` it already is; `fast-forward` it is moved there, its own board
// edits laid back over the top; `stay` it is left as it is, and why. Only the board's files and the
// folder they sit in may be dirty for the move: anything else is somebody's work, and a fast-forward
// that touches it is one nobody asked for.
export type CheckoutStep = 'current' | 'fast-forward' | { stay: string };

export function checkoutStep(state: CheckoutState): CheckoutStep {
  if (state.branch !== state.defaultBranch) return { stay: `it is not on ${state.defaultBranch}` };
  if (state.current) return 'current';
  if (!state.behind) return { stay: `it has commits ${state.defaultBranch} on origin does not` };
  if (blockingChanges(state.porcelain).length > 0) return { stay: 'it has changes outside .dashboard/' };
  return 'fast-forward';
}

// Whether the checkout's own uncommitted board goes into what is pushed: only on the default branch,
// where it is an edit of that branch's board. On another branch it is that branch's board, and pushing
// it would put a feature's board over main's.
export function publishesCheckout(branch: string | null, defaultBranch: string): boolean {
  return branch === defaultBranch;
}

// The commit's message: the moves when there are any, as the log says them, otherwise the cards whose
// files changed. Plain, so `git log .dashboard` reads as the board's history.
export function syncCommitMessage(before: Board, after: Board): string {
  const moves = cardMoves(before, after);
  if (moves.length > 0) return `board: ${moves.join('; ')}`;
  const was = new Map(before.columns.flatMap((column) => column.cards.map((card) => [card.id, card] as const)));
  const changed = after.columns.flatMap((column) => column.cards).filter((card) => JSON.stringify(was.get(card.id)) !== JSON.stringify(card));
  const kept = new Set(after.columns.flatMap((column) => column.cards.map((card) => card.id)));
  const removed = [...was.values()].filter((card) => !kept.has(card.id));
  const touched = [...changed, ...removed];
  if (touched.length === 0) return 'board: update the columns';
  if (touched.length === 1) return `board: ${changed.length === 1 ? 'update' : 'remove'} "${touched[0].title}"`;
  return `board: update ${touched.length} cards`;
}

// The one warning a write that could not reach origin prints or logs; the board is written here as it
// always was.
export function notSyncedWarning(reason: string): string {
  return `board written here only, not on origin: ${reason}`;
}
