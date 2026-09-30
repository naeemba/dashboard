import path from 'node:path';

// Whether a pane's shell is standing in a worktree, for the sweep that removes a finished card's
// worktree. Two folders are asked about, and either one is enough.
//
// The folder the pane was opened in, because that is the set a removal kills: a shell started in the
// worktree goes with it, even one that has since `cd`'d somewhere else.
//
// The folder the shell is in now, because `cd` never reaches the app. Open a plain pane, `cd` into the
// worktree and start a dev server or an nvim, and the pane's opened-in folder still says the project.
// Asked only that, the sweep would take the folder away under the dev server and the unsaved buffer.
// `current` is null when the shell could not be asked — it exited between the two questions, or the
// platform has no way to say — and then the opened-in folder is the only answer there is.
export function shellStandsIn(
  opened: string, current: string | null, worktreePath: string, realWorktreePath: string,
): boolean {
  if (opened === worktreePath) return true;
  if (current === null) return false;
  // Both spellings of the worktree: the operating system reports a process's folder with every
  // symlink followed, and the record holds whatever path the ship was given.
  return isInside(current, worktreePath) || isInside(current, realWorktreePath);
}

// A folder anywhere below the worktree counts, not only its top: `cd src` is still standing in it.
function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);
  if (relative === '') return true;
  if (path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== '..';
}

// The folder in `lsof -a -p <pid> -d cwd -Fn` output: a `p` line, an `f` line, and the name on the
// line starting `n`. Null when there is none — the process was already gone.
export function lsofDirectory(output: string): string | null {
  const line = output.split('\n').find((candidate) => candidate.startsWith('n'));
  return line === undefined ? null : line.slice(1);
}
