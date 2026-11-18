import { parseEveryWorktree } from '../../shared/ship/git-worktrees';
import { blockingChanges } from '../ship/ship';
import type { GitHubAnswer } from './pull-request-cli';

// After `pr land` merges, the local checkout of the base branch is behind it, and every land was
// followed by a git pull by hand. The checkout on that branch is the project's own folder or any
// worktree of its repository, whichever has it; it is fast-forwarded only when nothing is
// uncommitted there, `.dashboard/` aside as for a ship (blockingChanges), and only by --ff-only, so
// nothing of the user's is ever merged or overwritten. Every answer is a line: the merge already
// happened, so none of this fails the land.
export type GitPort = (folder: string, words: string[]) => Promise<GitHubAnswer>;

export async function fastForwardCheckout(git: GitPort, projectFolder: string, base: string): Promise<string> {
  const worktrees = await git(projectFolder, ['worktree', 'list', '--porcelain']);
  if (!worktrees.ok) return `${base} is not fast-forwarded: ${worktrees.output}`;
  const folder = parseEveryWorktree(worktrees.output, projectFolder).find((worktree) => worktree.branch === base)?.worktreePath;
  if (folder === undefined) return `no checkout is on ${base}, so none is fast-forwarded`;
  const notForwarded = (why: string) => `${base} in ${folder} is not fast-forwarded: ${why}`;
  const status = await git(folder, ['status', '--porcelain', '--untracked-files=no']);
  if (!status.ok) return notForwarded(status.output);
  if (blockingChanges(status.output).length > 0) return `${base} in ${folder} has uncommitted changes, so it is not fast-forwarded`;
  const pulled = await git(folder, ['pull', '--ff-only']);
  return pulled.ok ? `fast-forwarded ${base} in ${folder}` : notForwarded(pulled.output);
}
