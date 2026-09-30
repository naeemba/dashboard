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
// `current` is empty when the shell exited between the two questions, or the platform has no way to
// say, and then the opened-in folder is the only answer there is. A question that was asked and got
// no answer is a different thing — anyShellStandsIn below.
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

// Where each shell, and everything it started, is standing, by the shell's pid. `null` when the
// question could not be answered: `ps` or `lsof` would not run, or was killed for taking too long.
export type ShellDirectories = Map<number, string[]> | null;

// Whether any of these shells stands in the worktree. A question that got no answer keeps the
// worktree: `lsof` stuck on a sleeping network mount says nothing about the shell that `cd`'d into
// the worktree and left a dev server running there, and taking "no answer" for "nobody there" would
// delete the folder under it. The worktree goes on the first tick that gets an answer.
export function anyShellStandsIn(
  shells: readonly { opened: string; pid: number }[], directories: ShellDirectories,
  worktreePath: string, realWorktreePath: string,
): boolean {
  if (shells.length === 0) return false;
  if (directories === null) return true;
  return shells.some(({ opened, pid }) =>
    shellStandsIn(opened, directories.get(pid) ?? [], worktreePath, realWorktreePath));
}

// One question out at a time: every call made while one is out gets that one's answer, and the next
// call after it settles asks again. The review sweep walks its cards all at once, so twenty shells
// and three cards waiting cost one `ps` and one `lsof` a tick, not three of each.
//
// A call made while a question is out gets that answer even if it asked about something else: its
// own argument is never looked at. That is right only while every caller asks the same thing, as
// every card on a tick asks about every live shell. A caller that asks about its own subset would get
// a map missing its pids and fall back to the folder each shell was opened in.
export function oneQuestionAtATime<Asked, Answer>(
  ask: (asked: Asked) => Promise<Answer>,
): (asked: Asked) => Promise<Answer> {
  let asking: Promise<Answer> | null = null;
  return (asked) => {
    asking ??= ask(asked).finally(() => { asking = null; });
    return asking;
  };
}

// A folder anywhere below the worktree counts, not only its top: `cd src` is still standing in it.
function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);
  if (relative === '') return true;
  if (path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== '..';
}

// Each shell with every process under it, children and their children, the shell first. `parents` is
// pane-sessions.ts's reading of `ps -eo pid=,ppid=`. An empty tree leaves each shell on its own. A
// `ps` that gave no answer never reaches here: the lookup returns `null`, and anyShellStandsIn keeps
// the worktree.
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

// What a command that failed still printed, when that is an answer. `lsof` exits 1 when any pid in
// its list has already gone, and still prints every one that has not: that is an answer. A command
// killed for taking too long, or one that never ran, printed part of an answer or none — `null`.
export function answerDespiteFailure(error: unknown): string | null {
  const { stdout, killed, code } = (error ?? {}) as { stdout?: unknown; killed?: unknown; code?: unknown };
  return typeof stdout === 'string' && killed !== true && typeof code === 'number' ? stdout : null;
}
