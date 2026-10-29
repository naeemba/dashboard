import { randomUUID } from 'node:crypto';
import { baseBranch, git } from './git';
import { branchNameFor, worktreePathFor } from './ship';

// A worktree for a dispatched task that is not a card: a branch named after the prompt, off the tip of
// the base branch on origin, in the same folder a ship would put it. Not recorded with the cards'
// worktrees, since there is no card to show it on; the manager's worktree list finds it through git,
// and session release removes it once its work is out. The caller holds the project's git queue.
export async function makeThrowawayWorktree(projectPath: string, title: string): Promise<string> {
  const base = await baseBranch(projectPath);
  await git(['fetch', 'origin', base], projectPath);
  const heads = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
  const branch = branchNameFor(title, randomUUID(), heads.split('\n').filter((name) => name !== ''));
  const worktreePath = worktreePathFor(projectPath, branch);
  await git(['worktree', 'add', '-b', branch, worktreePath, `origin/${base}`], projectPath);
  return worktreePath;
}
