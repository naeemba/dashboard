import { failureText } from '../../shared/errors/failure';
import type { runProgram } from '../app/git';
import { latestPullRequest, pullRequestListArguments } from '../board/pull-request-column';
import { changedFiles } from '../ship/ship';
import { FETCH_TIMEOUT } from '../board/board-sync';

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
    return await hasPullRequest(run, worktreePath, branch) ? null : `${branch} has no pull request`;
  } catch (error: unknown) {
    return `gh could not say whether ${branch} has a pull request: ${failureText(error)}`;
  }
}

const branchOf = (run: RunProgram, worktreePath: string) => run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);

// Whether gh lists a pull request from the branch in any state.
async function hasPullRequest(run: RunProgram, worktreePath: string, branch: string): Promise<boolean> {
  const pulls: unknown = JSON.parse(await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number'], worktreePath));
  return Array.isArray(pulls) && pulls.length > 0;
}

// Whether the pull request the worktree's branch stands for merged: what `pane finish` releases a
// worker on when its card is not Done yet (the follow that moves it runs on a timer) or it has none.
// The one the card follows (latestPullRequest), so a branch that merged one and opened another since
// is not finished while the second is open.
// Bounded, because the sweep waits on it before it looks at any other worker: a gh that never answers
// rejects here instead, which keeps the pane until the next sweep asks again.
export async function pullRequestMerged(run: RunProgram, worktreePath: string): Promise<boolean> {
  const branch = await branchOf(run, worktreePath);
  return latestPullRequest(await run('gh', pullRequestListArguments(branch), worktreePath, { timeout: FETCH_TIMEOUT }))?.state === 'MERGED';
}

// What a worktree's worker is asked before it is let go of, as session-requests.ts's ports take them.
export function worktreeChecks(run: RunProgram) {
  return {
    unfinished: (worktreePath: string) => unfinishedWork(run, worktreePath),
    merged: (worktreePath: string) => pullRequestMerged(run, worktreePath),
  };
}
