import { gitNowOrNull } from '../app/git';
import { baseBranchNow } from '../app/base-branch';
import { publishesCheckout } from './board-sync';

// Whether a board read may rewrite a seeded doc that is there but older than this build's text
// (board-decision-8). Only in a checkout standing on the project's base branch, or in a folder git does
// not manage. Anywhere else it is a feature branch's copy: rewritten in place it is a change nobody
// committed, and the worker's next `git merge` of the default branch refuses to overwrite it, stalling
// the task until someone restores the file. Left alone, the branch gets the new text with that merge,
// and the board guard already refuses the hand edit the old text describes. A missing doc is written
// anywhere, as it always was: there is nothing on disk for a merge to trip on.
//
// `branch` is what `git symbolic-ref --short -q HEAD` printed (null when detached), `defaultBranch`
// what baseBranchNow answered (null when there is none).
export type SeededDocsCheckout =
  | { insideWorkTree: false }
  | { insideWorkTree: true; branch: string | null; defaultBranch: string | null };

//
// A repository with no base branch (none of <remote>/HEAD, main and master on its remote) counts as
// outside git: no merge of the default branch will ever bring the new text there,
// and the sync cannot push it either, so left alone the doc would stay stale for good.
export function rewritesStaleSeededDocs(checkout: SeededDocsCheckout): boolean {
  if (!checkout.insideWorkTree || checkout.defaultBranch === null) return true;
  return publishesCheckout(checkout.branch, checkout.defaultBranch);
}

// The answer for a folder, kept a minute. Asked only when a doc is there and stale, and off the default
// branch it stays stale, so without this every read of that board (the manager's every five seconds)
// would block main on three to five git processes. A branch switched in the meantime is seen a minute
// late, which costs the rewrite that long and nothing else.
const ANSWER_LIFETIME = 60_000;
const answers = new Map<string, { rewrites: boolean; at: number }>();

export function rewritesStaleSeededDocsAt(projectPath: string, now = Date.now()): boolean {
  const kept = answers.get(projectPath);
  if (kept !== undefined && now - kept.at < ANSWER_LIFETIME) return kept.rewrites;
  const rewrites = rewritesStaleSeededDocs(seededDocsCheckout(projectPath));
  answers.set(projectPath, { rewrites, at: now });
  return rewrites;
}

// What git says of the folder, asked synchronously since seeding is.
function seededDocsCheckout(projectPath: string): SeededDocsCheckout {
  const answer = (gitArguments: string[]) => gitNowOrNull(gitArguments, projectPath);
  if (answer(['rev-parse', '--is-inside-work-tree']) !== 'true') return { insideWorkTree: false };
  return { insideWorkTree: true, branch: answer(['symbolic-ref', '--short', '-q', 'HEAD']), defaultBranch: baseBranchNow(projectPath)?.branch ?? null };
}
