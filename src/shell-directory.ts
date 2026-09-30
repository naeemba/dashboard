import path from 'node:path';

// Whether a pane's shell is standing in a worktree, for the sweep that removes a finished card's
// worktree. Two kinds of folder are asked about, and any one of them is enough.
//
// The folder the pane was opened in, because that is the set a removal kills: a shell started in the
// worktree goes with it, even one that has since `cd`'d somewhere else.
//
// The folders the shell and everything it started are in now, because `cd` never reaches the app.
// Open a plain pane, `cd` into the worktree and start a dev server or an nvim, and the pane's
// opened-in folder still says the project. Run `pnpm -C ../fix-login dev` from the project and the
// shell never moves at all; only the dev server is there. Asked only the opened-in folder, the sweep
// would take the worktree away under the dev server and the unsaved buffer.
//
// `current` is empty when nothing could be asked — the shell exited between the two questions, or the
// platform has no way to say — and then the opened-in folder is the only answer there is.
//
// What no folder can catch: `nvim ../fix-login/src/x.ts` run from the project. nvim's folder is the
// project and it does not hold the file open, so nothing here says it is there. The help says so.
export function shellStandsIn(
  opened: string, current: readonly string[], worktreePath: string, realWorktreePath: string,
): boolean {
  if (opened === worktreePath) return true;
  // Both spellings of the worktree: the operating system reports a process's folder with every
  // symlink followed, and the record holds whatever path the ship was given.
  return current.some((directory) =>
    isInside(directory, worktreePath) || isInside(directory, realWorktreePath));
}

// A folder anywhere below the worktree counts, not only its top: `cd src` is still standing in it.
function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);
  if (relative === '') return true;
  if (path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== '..';
}

// Each shell with every process under it, children and their children, the shell first. `parents` is
// pane-sessions.ts's reading of `ps -eo pid=,ppid=`. An empty tree — no `ps`, or it failed — leaves
// each shell on its own, which is the answer the sweep had before it asked about children at all.
export function familiesOf(
  parents: ReadonlyMap<number, number>, shellPids: readonly number[],
): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const [pid, parent] of parents) {
    if (pid === parent) continue;
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const families = new Map<number, number[]>();
  for (const shellPid of shellPids) {
    // A set, so a tree that loops back on itself — a pid reused while `ps` was reading — cannot
    // walk forever.
    const family = new Set([shellPid]);
    for (const pid of family) for (const child of children.get(pid) ?? []) family.add(child);
    families.set(shellPid, [...family]);
  }
  return families;
}

// The folder of every process in `lsof -a -p <pid>,<pid> -d cwd -Fn` output: for each one a `p` line
// with its pid, an `f` line, and the folder on a line starting `n`. A process already gone has no
// lines at all, so it is simply missing from the answer.
export function lsofDirectories(output: string): Map<number, string> {
  const directories = new Map<number, string>();
  let pid: number | null = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid !== null && Number.isInteger(pid)) directories.set(pid, line.slice(1));
  }
  return directories;
}
