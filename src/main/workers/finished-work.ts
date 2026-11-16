import { failureText } from '../../shared/errors/failure';
import type { runProgram } from '../app/git';
import { changedFiles } from '../ship/ship';

// Whether a throwaway worktree's work has left it: committed, pushed, and a pull request open. Only
// then is the folder thrown away when its worker is released — before that, removing it would take the
// work with it. changedFiles rather than blockingChanges, because git counts .dashboard/ like any other
// folder and so does this: an uncommitted board move is work not yet on the branch.
//
// Null when it is all done, otherwise the reason the folder stays, written to follow "kept <folder>:".
export type RunProgram = typeof runProgram;

export async function unfinishedWork(run: RunProgram, worktreePath: string): Promise<string | null> {
  if (changedFiles(await run('git', ['status', '--porcelain'], worktreePath)).length > 0) {
    return 'it has uncommitted changes';
  }
  let ahead: string;
  try {
    ahead = await run('git', ['rev-list', '--count', '@{upstream}..HEAD'], worktreePath);
  } catch {
    return 'its branch was never pushed';
  }
  if (ahead !== '0') return `${ahead} of its commits are not pushed`;
  const branch = await branchOf(run, worktreePath);
  try {
    return await hasPullRequest(run, worktreePath, branch, 'all') ? null : `${branch} has no pull request`;
  } catch (error: unknown) {
    return `gh could not say whether ${branch} has a pull request: ${failureText(error)}`;
  }
}

const branchOf = (run: RunProgram, worktreePath: string) => run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);

// Whether gh lists a pull request from the branch in that state: `all` for release, `merged` for finish.
async function hasPullRequest(run: RunProgram, worktreePath: string, branch: string, state: 'all' | 'merged'): Promise<boolean> {
  const pulls: unknown = JSON.parse(await run('gh', ['pr', 'list', '--head', branch, '--state', state, '--json', 'number'], worktreePath));
  return Array.isArray(pulls) && pulls.length > 0;
}

// Whether the branch the worktree is on has a merged pull request: what `pane finish` releases a
// worker on when its card is not Done yet (the follow that moves it runs on a timer) or it has none.
export async function pullRequestMerged(run: RunProgram, worktreePath: string): Promise<boolean> {
  return hasPullRequest(run, worktreePath, await branchOf(run, worktreePath), 'merged');
}

// What a worktree's worker is asked before it is let go of, as session-requests.ts's ports take them.
export function worktreeChecks(run: RunProgram) {
  return {
    unfinished: (worktreePath: string) => unfinishedWork(run, worktreePath),
    merged: (worktreePath: string) => pullRequestMerged(run, worktreePath),
  };
}
