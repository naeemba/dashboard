import type { runProgram } from '../app/git';
import { latestPullRequest, pullRequestListArguments } from '../board/pull-request-column';
import { changedFiles } from '../ship/ship';
import { FETCH_TIMEOUT } from '../board/board-sync';

// Whether removing a throwaway worktree would lose anything: changes nobody committed, or commits no
// remote has. Only then is the folder kept when its worker goes. A pull request is not asked for: a
// research worker that changed nothing, or one that merged somebody else's pull request, leaves a branch
// with no commits of its own and nothing to open one for, and keeping those piled up 32 folders, 25 GB,
// in one project. changedFiles rather than blockingChanges, because git counts .dashboard/ like any other
// folder and so does this: an uncommitted board move is work not yet on the branch. Ignored files (build
// output, node_modules) are not work, and git status does not list them.
//
// Null when nothing would be lost, otherwise the reason the folder stays, written to follow "kept <folder>:".
export type RunProgram = typeof runProgram;

export async function unfinishedWork(run: RunProgram, worktreePath: string): Promise<string | null> {
  if (changedFiles(await run('git', ['status', '--porcelain'], worktreePath)).length > 0) {
    return 'it has uncommitted changes';
  }
  // Against every remote-tracking branch, not the upstream: a branch never pushed that is still where
  // origin/main was has nothing to lose, and a worker that checked out a pull request's branch has none.
  const missing = await run('git', ['rev-list', '--count', 'HEAD', '--not', '--remotes'], worktreePath);
  return missing === '0' ? null : `${missing} of its commits are on no remote`;
}

const branchOf = (run: RunProgram, worktreePath: string) => run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);

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
