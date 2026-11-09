import { flightParts, type Card } from './board';

// The one thing a card says about its pull request beyond its number (board-decision-7): its checks,
// its review and whether it can merge, read from `gh` by main (pull-request-status.ts there) and
// drawn here, so the board and the help say the same glyph for the same state.
export type PullRequestStatus = 'running' | 'failed' | 'approved' | 'mergeable' | 'merged';

export const PULL_REQUEST_GLYPHS: Record<PullRequestStatus, string> = {
  running: '◌',
  failed: '✗',
  approved: '✓',
  mergeable: '●',
  merged: '◆',
};

// The card's branch, pull request and that pull request's glyph, as one line; empty when it has none.
export function flightLine(card: Card, status: PullRequestStatus | undefined): string {
  return [...flightParts(card), ...(status === undefined ? [] : [PULL_REQUEST_GLYPHS[status]])].join(' · ');
}
