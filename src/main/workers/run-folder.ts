import { isDirectory } from '../app/projects';
import { realPath } from '../app/real-path';
import { isInside } from '../panes/shell-directory';
import { listWorktrees } from '../ship/worktree-scan';

// Where `pane run --in <folder>` may start a worker: a folder that is there, inside the project's
// checkout or inside a worktree of its repository, as `git worktree list` from the project names them.
// The folder is the caller's — a worktree it keeps on a branch of its own — so nothing here makes or
// removes one, and release leaves it where it is. Anything else is refused: a worker run in some other
// repository works on code this project's main cannot see, and its pull request follows no card here.

// Why the folder is refused, or null. Every path is a real one, since git prints real paths. isInside
// compares with the platform's own path rules, so a Windows worktree git prints as `C:/code/api-mr` is
// the folder typed as `c:\code\api-mr`.
export function runFolderRefusal(
  folder: string, isDirectory: boolean, projectPath: string, worktreePaths: readonly string[],
): string | null {
  if (!isDirectory) return `${folder} is not a folder`;
  if ([projectPath, ...worktreePaths].some((root) => isInside(folder, root))) return null;
  return `${folder} is neither inside ${projectPath} nor a worktree of its repository — \`git worktree list\` there names those`;
}

// The same refusal for a folder on disk. A project git cannot list (not a repository) has only its own
// checkout to offer.
export async function checkRunFolder(projectPath: string, folder: string): Promise<string | null> {
  const real = realPath(folder);
  const worktrees = (await listWorktrees(projectPath)).map((worktree) => realPath(worktree.worktreePath));
  return runFolderRefusal(real, isDirectory(real), realPath(projectPath), worktrees);
}
