import { defaultBranch } from '../app/default-branch';
import { gitNow } from '../app/git';

// Whether a board read may rewrite a seeded doc that is there but older than this build's text
// (board-decision-8). Only in a checkout standing on origin's default branch, or in a folder git does
// not manage. Anywhere else it is a feature branch's copy: rewritten in place it is a change nobody
// committed, and the worker's next `git merge` of the default branch refuses to overwrite it, stalling
// the task until someone restores the file. Left alone, the branch gets the new text with that merge,
// and the board guard already refuses the hand edit the old text describes. A missing doc is written
// anywhere, as it always was: there is nothing on disk for a merge to trip on.
//
// `branch` is what `git symbolic-ref --short -q HEAD` printed (null when detached); `head` and
// `hasBranch` are what defaultBranch reads.
export type SeededDocsCheckout =
  | { insideWorkTree: false }
  | { insideWorkTree: true; branch: string | null; head: string | null; hasBranch: (name: string) => boolean };

export function rewritesStaleSeededDocs(checkout: SeededDocsCheckout): boolean {
  if (!checkout.insideWorkTree) return true;
  return checkout.branch !== null && checkout.branch === defaultBranch('origin', checkout.head, checkout.hasBranch);
}

// What git says of the folder, asked synchronously since seeding is. Only called when a doc is there
// and stale, which after the first rewrite on the default branch is never, so the read is not slowed.
export function seededDocsCheckout(projectPath: string): SeededDocsCheckout {
  const answer = (gitArguments: string[]): string | null => {
    try {
      return gitNow(gitArguments, projectPath);
    } catch {
      return null;
    }
  };
  if (answer(['rev-parse', '--is-inside-work-tree']) !== 'true') return { insideWorkTree: false };
  return {
    insideWorkTree: true,
    branch: answer(['symbolic-ref', '--short', '-q', 'HEAD']),
    head: answer(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
    hasBranch: (name) => answer(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}`]) !== null,
  };
}
