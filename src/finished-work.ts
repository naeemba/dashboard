import { failureText } from './failure';
import { changedFiles } from './ship';

// Whether a throwaway worktree's work has left it: committed, pushed, and a pull request open. Only
// then is the folder thrown away when its worker is released — before that, removing it would take the
// work with it. changedFiles rather than blockingChanges, because git counts .dashboard/ like any other
// folder and so does this: an uncommitted board move is work not yet on the branch.
//
// Null when it is all done, otherwise the reason the folder stays, written to follow "kept <folder>:".
export type RunProgram = (program: string, args: string[], cwd: string) => Promise<string>;

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
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  let pulls: unknown;
  try {
    pulls = JSON.parse(await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number'], worktreePath));
  } catch (error: unknown) {
    return `gh could not say whether ${branch} has a pull request: ${failureText(error)}`;
  }
  return Array.isArray(pulls) && pulls.length > 0 ? null : `${branch} has no pull request`;
}
