import { parseEveryWorktree } from '../../shared/ship/git-worktrees';
import { blockingChanges } from '../ship/ship';
import type { ProgramAnswer } from './pull-request-cli';

// After `pr land` merges, the local checkout of the base branch is behind it, and every land was
// followed by a git pull by hand. The checkout on that branch is the project's own folder or any
// worktree of its repository, whichever has it; it is fast-forwarded only when nothing is
// uncommitted there, `.dashboard/` aside as for a ship (blockingChanges), and only by --ff-only, so
// nothing of the user's is ever merged or overwritten. It fetches the project's remote (projectRemote,
// the one a ship cuts from) and merges <remote>/<base>, as a ship does (ship-flow.ts), so a
// base with no upstream set is fast-forwarded all the same. Every answer is a line: the merge already
// happened, so none of this fails the land.
export type GitPort = (folder: string, words: string[]) => Promise<ProgramAnswer>;

export async function fastForwardCheckout(git: GitPort, projectFolder: string, remote: string, base: string): Promise<string> {
  const worktrees = await git(projectFolder, ['worktree', 'list', '--porcelain']);
  if (!worktrees.ok) return `${base} is not fast-forwarded: ${worktrees.output}`;
  const folder = parseEveryWorktree(worktrees.output, projectFolder).find((worktree) => worktree.branch === base)?.worktreePath;
  if (folder === undefined) return `no checkout is on ${base}, so none is fast-forwarded`;
  const notForwarded = (why: string) => `${base} in ${folder} is not fast-forwarded: ${why}`;
  const status = await git(folder, ['status', '--porcelain', '--untracked-files=no']);
  if (!status.ok) return notForwarded(status.output);
  if (blockingChanges(status.output).length > 0) return `${base} in ${folder} has uncommitted changes, so it is not fast-forwarded`;
  const fetched = await git(folder, ['fetch', remote, base]);
  if (!fetched.ok) return notForwarded(fetched.output);
  const merged = await git(folder, ['merge', '--ff-only', `${remote}/${base}`]);
  return merged.ok ? `fast-forwarded ${base} in ${folder}` : notForwarded(merged.output);
}
