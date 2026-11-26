import type { runProgram } from '../app/git';
import { branchPullRequest } from '../board/merge-request';
import { BEYOND_THE_BOARD, workChanges } from '../ship/ship';
import { FETCH_TIMEOUT } from '../board/board-sync';

// Whether removing a throwaway worktree would lose anything: changes nobody committed, or commits no
// remote has. Only then is the folder kept when its worker goes. A pull request is not asked for: a
// research worker that changed nothing, or one that merged somebody else's pull request, leaves a branch
// with no commits of its own and nothing to open one for, and keeping those piled up 32 folders, 25 GB,
// in one project. The board's files are not work (workChanges says why). Ignored files (build output,
// node_modules) are not work either, and git status does not list them.
//
// Null when nothing would be lost, otherwise the reason the folder stays, written to follow "kept <folder>:".
type RunProgram = typeof runProgram;

export async function unfinishedWork(run: RunProgram, worktreePath: string): Promise<string | null> {
  if (workChanges(await run('git', ['status', '--porcelain'], worktreePath)).length > 0) {
    return 'it has uncommitted changes';
  }
  const missing = await unpushedWork(run, worktreePath);
  if (missing === 0) return null;
  // A squash or rebase merge leaves the branch's own commits on no remote once --delete-branch and a
  // prune take the branch: nothing past the commit its pull request merged at, nothing the merge did not take.
  const past = await branchOf(run, worktreePath)
    .then((branch) => mergedHead(run, worktreePath, branch))
    .then((merged) => (merged === null ? missing : unpushedWork(run, worktreePath, merged)))
    .catch(() => missing);
  return past === 0 ? null : `${missing} of its commits are on no remote`;
}

// How many commits HEAD reaches that touch more than the board and that neither a remote-tracking
// branch nor `mergedAt` (the commit its pull request merged at) does. Every remote-tracking branch,
// not the upstream: a branch never pushed that is still where origin/main was has nothing to lose,
// and a worker that checked out a pull request's branch has none. NaN, never 0, for an answer that is
// not a number.
export async function unpushedWork(run: RunProgram, worktreePath: string, mergedAt?: string): Promise<number> {
  const not = mergedAt === undefined ? [] : [mergedAt];
  const count = await run('git', ['rev-list', '--count', 'HEAD', '--not', ...not, '--remotes', ...BEYOND_THE_BOARD], worktreePath);
  return count.trim() === '' ? Number.NaN : Number(count);
}

const branchOf = (run: RunProgram, worktreePath: string) => run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);

// Whether the pull request the worktree's branch stands for merged: what `pane finish` releases a
// worker on when its card is not Done yet (the follow that moves it runs on a timer) or it has none.
// The one the card follows (latestPullRequest), so a branch that merged one and opened another since
// is not finished while the second is open.
// Bounded, because the sweep waits on it before it looks at any other worker: a forge CLI that never
// answers rejects here instead, which keeps the pane until the next sweep asks again.
export async function pullRequestMerged(run: RunProgram, worktreePath: string): Promise<boolean> {
  return (await pullRequestOf(run, worktreePath, await branchOf(run, worktreePath)))?.state === 'MERGED';
}

const pullRequestOf = (run: RunProgram, worktreePath: string, branch: string) =>
  branchPullRequest(run, worktreePath, branch, FETCH_TIMEOUT);

// The commit the branch's pull request was merged at, or null while the one it stands for is not
// merged. A worktree whose HEAD is that commit has nothing on it the merge did not take; its
// `@{upstream}` cannot say so, because a merge that deletes the branch takes the upstream with it.
export async function mergedHead(run: RunProgram, worktreePath: string, branch: string): Promise<string | null> {
  const pull = await pullRequestOf(run, worktreePath, branch);
  return pull?.state === 'MERGED' && typeof pull.headRefOid === 'string' ? pull.headRefOid : null;
}

// What a worktree's worker is asked before it is let go of, as session-requests.ts's ports take them.
export function worktreeChecks(run: RunProgram) {
  return {
    unfinished: (worktreePath: string) => unfinishedWork(run, worktreePath),
    merged: (worktreePath: string) => pullRequestMerged(run, worktreePath),
    branch: (worktreePath: string) => branchOf(run, worktreePath),
  };
}
