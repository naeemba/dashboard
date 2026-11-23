import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { git } from '../app/git';
import { listWorktrees } from '../ship/worktree-scan';

// Which worktrees are throwaways, read back after a restart: which pane held one lives in memory
// (session-requests.ts), so the launch's worktree.sweep finds them by a file in git's own folder for
// each worktree, `.git/worktrees/<name>/`. There rather than in the worktree, so git status never lists
// it, and rather than on the branch, so a worker that checks out a pull request's branch keeps it. git
// deletes the folder with the worktree, so nothing is left to clean up.

const MARKER = 'dashboard-throwaway';

export async function markThrowaway(worktreePath: string): Promise<void> {
  await writeFile(path.join(await git(['rev-parse', '--absolute-git-dir'], worktreePath), MARKER), '');
}

// Every marked worktree of the project, as the manager's list names it. None for a folder that is not
// a repository; a worktree whose folder is gone cannot be asked, and is left to `git worktree prune`.
export async function throwawaysOf(projectPath: string): Promise<string[]> {
  const marked = await Promise.all((await listWorktrees(projectPath)).map(async ({ worktreePath }) => {
    const gitFolder = await git(['rev-parse', '--absolute-git-dir'], worktreePath).catch(() => null);
    return gitFolder !== null && existsSync(path.join(gitFolder, MARKER)) ? [worktreePath] : [];
  }));
  return marked.flat();
}
