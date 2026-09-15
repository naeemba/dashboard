// Which pane a Claude Code session is running in.
//
// Nothing in a session's log says. What does say is the process tree: the app spawns a shell for each
// pane and holds its pid, Claude Code writes ~/.claude/sessions/<pid>.json while it runs, and the
// claude process is a child of one of those shells. So the answer is a walk from the session's own
// process up through its parents until it reaches a pane — or runs out, which is what happens for
// every claude started in a terminal that is not ours.
//
// Out of main.ts because it is a walk with a loop and two ways to stop, and because the wrong answer
// is quiet: a pane shows another pane's number and both look plausible.

// How far up to walk before giving up. A pane's shell is the session's parent or its grandparent, so
// this is only here to stop a tree that loops back on itself from hanging the sweep — which a tree
// cannot do, until the day something reparents a process while we are reading it.
const MAX_DEPTH = 20;

// `ps -eo pid=,ppid=` and nothing else: two columns of numbers, one process a line. Anything that is
// not two numbers is skipped rather than throwing — a header nobody asked for, a blank last line.
export function parentProcesses(psOutput: string): Map<number, number> {
  const parents = new Map<number, number>();
  for (const line of psOutput.split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(parent)) continue;
    parents.set(pid, parent);
  }
  return parents;
}

// The pane a process belongs to, or undefined for one started outside the app. Checks the process
// itself first: the day something runs claude as the pane's shell rather than inside it, the pid is
// the pane's own and the walk would otherwise step straight past it.
export function paneOfProcess(
  parents: ReadonlyMap<number, number>,
  panes: ReadonlyMap<number, string>,
  pid: number,
): string | undefined {
  let at = pid;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const pane = panes.get(at);
    if (pane !== undefined) return pane;
    const parent = parents.get(at);
    // Reaching pid 1 means the walk left the app without passing through a pane: another terminal,
    // another editor, a launch agent. Its tokens still count towards the project, just not a pane.
    if (parent === undefined || parent <= 1) return undefined;
    at = parent;
  }
  return undefined;
}

// Every live session placed on the pane it is running in. A session whose process has already gone is
// dropped on its own: its pid is not in the tree, so the walk finds no parent and no pane.
//
// Two sessions in one pane cannot happen while both are running — claude holds the terminal — but a
// stale file left by a crash can still name that pane. The last one wins, which is the newer of the
// two, because a stale pid is only reused by a process that started later.
export function sessionsByPane(
  parents: ReadonlyMap<number, number>,
  panes: ReadonlyMap<number, string>,
  sessions: readonly { pid: number; session: string }[],
): Map<string, string> {
  const byPane = new Map<string, string>();
  for (const { pid, session } of sessions) {
    const pane = paneOfProcess(parents, panes, pid);
    if (pane !== undefined) byPane.set(pane, session);
  }
  return byPane;
}
