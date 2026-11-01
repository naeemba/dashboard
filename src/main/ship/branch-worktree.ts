import { randomUUID } from 'node:crypto';
import { baseBranch, git } from '../app/git';
import { branchNameFor, worktreePathFor } from './ship';

// A new branch off the tip of the base branch on origin, checked out in the folder beside the project
// where every worktree the app makes goes. Named after `title`, with `id` to break a tie. The one
// recipe for both a ship and a dispatched task, so the two cannot come to put their work in different
// places. The caller has fetched, and holds the project's git queue.
export async function addBranchWorktree(
  projectPath: string, title: string, id: string, base: string,
): Promise<{ branch: string; worktreePath: string }> {
  const heads = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
  const branch = branchNameFor(title, id, heads.split('\n').filter((name) => name !== ''));
  const worktreePath = worktreePathFor(projectPath, branch);
  await git(['worktree', 'add', '-b', branch, worktreePath, `origin/${base}`], projectPath);
  return { branch, worktreePath };
}

// A worktree for a dispatched task that is not a card, named after its prompt. Not recorded with the
// cards' worktrees, since there is no card to show it on; the manager's worktree list finds it through
// git, and session release removes it once its work is out.
export async function makeThrowawayWorktree(projectPath: string, title: string): Promise<string> {
  const base = await baseBranch(projectPath);
  await git(['fetch', 'origin', base], projectPath);
  return (await addBranchWorktree(projectPath, title, randomUUID(), base)).worktreePath;
}
