import path from 'node:path';
import { isDirectory } from '../app/projects';
import { realPath } from '../app/real-path';
import { worktreeCheckoutOf } from '../board/linked-worktree';
import { isInside } from '../panes/shell-directory';
import { listWorktrees } from '../ship/worktree-scan';
import { parseEveryWorktree } from '../../shared/ship/git-worktrees';
import type { Refused } from '../../shared/app/bridge';

// Where `pane run --in <folder>` may start a worker: a folder that is there, inside the project's
// checkout or inside a worktree of its repository, as `git worktree list` from the project names them.
// The folder is the caller's — a worktree it keeps on a branch of its own — so nothing here makes or
// removes one, and release leaves it where it is. Anything else is refused: a worker run in some other
// repository works on code this project's main cannot see, and its pull request follows no card here.

// Why the folder is refused, or null. Every path is a real one, since git prints real paths. isInside
// compares with the platform's own path rules, so a Windows worktree git prints as `C:/code/api-mr` is
// the folder typed as `c:\code\api-mr`.
export function runFolderRefusal(
  folder: string, folderExists: boolean, projectPath: string, worktreePaths: readonly string[],
): string | null {
  if (!folderExists) return `${folder} is not a folder`;
  if ([projectPath, ...worktreePaths].some((root) => isInside(folder, root))) return null;
  return `${folder} is neither inside ${projectPath} nor a worktree of its repository — \`git worktree list\` there names those`;
}

// The worktree the folder is in, other than the project's checkout, or undefined for a folder of the
// checkout itself. The deepest one listed, so a worktree nested in the checkout
// (`<project>/.claude/worktrees/x`) is its own worktree and not the checkout. The checkout is told
// apart by isInside both ways, not by spelling, for the reason runFolderRefusal gives.
export function worktreeHolding(folder: string, projectPath: string, worktreePaths: readonly string[]): string | undefined {
  return worktreePaths
    .filter((root) => !(isInside(root, projectPath) && isInside(projectPath, root)) && isInside(folder, root))
    .sort((one, other) => other.length - one.length)[0];
}

// The same refusal for a folder on disk, or the worktree it is in. A project git cannot list (not a
// repository) has only its own checkout to offer. The repository's main checkout is offered too: it is
// not the project when the project was opened at a linked worktree.
export async function checkRunFolder(projectPath: string, folder: string): Promise<{ worktree: string | undefined } | Refused> {
  const real = realPath(folder);
  const project = realPath(projectPath);
  const worktrees = (await listWorktrees(projectPath, parseEveryWorktree)).map((worktree) => realPath(worktree.worktreePath));
  const refusal = runFolderRefusal(real, isDirectory(real), project, worktrees);
  return refusal === null ? { worktree: worktreeHolding(real, project, worktrees) } : { refused: refusal };
}

// The linked worktree a folder inside `root` is in below `root`, or undefined when it is root's own:
// the first folder up from it that holdsWorktree. Read from disk rather than remembered from `run --in`, so a worker resumed at
// launch is in the same worktree as before the restart.
export function worktreeWithin(directory: string, root: string, holdsWorktree: (folder: string) => boolean): string | undefined {
  for (let folder = directory; !isInside(root, folder); folder = path.dirname(folder)) {
    if (holdsWorktree(folder)) return folder;
  }
  return undefined;
}

// Whether the folder is the top of a linked worktree, wherever it sits: a submodule's `.git` file is not one.
export function holdsWorktree(folder: string): boolean {
  return worktreeCheckoutOf(folder) !== undefined;
}
