import { isManagerPath } from '../../../shared/manager/manager';

// Whether a folder's board is a project's own, which is what keeps an agent's `board move <id> Ship`
// on its worktree's board from shipping its card again: not the manager's, and not the folder of any
// worktree the app recorded. Compared through `resolve` (realPath in main), as slotOfProject does: the
// command's folder is process.cwd(), symlinks resolved, and the record keeps the path it was made at.
// `linked` (isLinkedWorktree in main) catches a worktree the records miss, from its own `.git` file.
export function isProjectBoard(
  projectPath: string,
  worktreePaths: readonly string[],
  resolve: (folder: string) => string,
  linked: (folder: string) => boolean,
): boolean {
  if (isManagerPath(projectPath) || linked(projectPath)) return false;
  const folder = resolve(projectPath);
  return !worktreePaths.some((worktreePath) => resolve(worktreePath) === folder);
}
