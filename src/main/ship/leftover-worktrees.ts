import { join } from 'node:path';
import { realPath } from '../app/real-path';
import { isInside } from '../panes/shell-directory';
import type { GitWorktree } from '../../shared/ship/git-worktrees';
import { worktreesRoot } from './ship';

// Worktrees beside an open project that nothing in the app will ever remove: a `pane run --worktree`
// throwaway whose pane was closed by hand, released while its pull request was still open, or lost to
// a restart (the release's list of them lives in memory), and a card's whose record went. Each is a
// full checkout with its node_modules; eight of them filled /home in two days in new-crm (2026-11-23).
//
// One is removed only when nothing in it can be lost: no uncommitted change, HEAD the very commit its
// branch's pull request merged at (so no commit of it is anywhere the merge did not take), and no
// process on the machine standing in it. A worktree the app records is the review sweep's
// (review-flow.ts), which removes a card's once it is past Review, and keeps a cancelled one's.
// Only folders under `<project>.worktrees/`, where the app makes them: a worktree made by hand
// anywhere else is yours.
//
// And `<project>/.claude/worktrees/`, where a workflow's agents get theirs (`wf_<run>-<n>`): 27 of
// them, 135 MB to 2.2 GB each, in three days in new-crm. They have no pull request, so one goes when
// it is clean, its HEAD is on a remote (`rev-list HEAD --not --remotes` is empty), nobody stands in
// it, and nothing in it has changed for a day, which is how long a run gets to come back for it.

export type LeftoverPorts = {
  projectPaths: () => readonly string[];
  // The worktree paths the app records (worktrees.json).
  recorded: () => readonly string[];
  list: (projectPath: string) => Promise<GitWorktree[]>;
  // True when git cannot say: silence is not no changes.
  dirty: (worktreePath: string) => Promise<boolean>;
  head: (worktreePath: string) => Promise<string>;
  // The commit the branch's pull request merged at, or null while it is not merged (mergedHead).
  mergedHead: (worktreePath: string, branch: string) => Promise<string | null>;
  // Whether every commit HEAD reaches is on some remote ref.
  pushed: (worktreePath: string) => Promise<boolean>;
  // When the folder, or git's own record of it (index, HEAD), last changed, in milliseconds.
  modifiedAt: (worktreePath: string) => Promise<number>;
  now: () => number;
  // True when any process stands in the folder, or when that cannot be asked.
  processIn: (worktreePath: string) => Promise<boolean>;
  // worktree.remove, unforced.
  remove: (worktreePath: string, projectPath: string) => Promise<unknown>;
};

export const AGENT_IDLE_MS = 24 * 60 * 60 * 1000;

type Kind = 'card' | 'agent';

// Cheapest question first: git status, then git or gh, then the process table. One that throws keeps
// the worktree, and the next sweep asks again.
async function isLeftover(ports: LeftoverPorts, kind: Kind, { worktreePath, branch }: GitWorktree): Promise<boolean> {
  if (await ports.dirty(worktreePath)) return false;
  if (kind === 'card') {
    const merged = await ports.mergedHead(worktreePath, branch);
    if (merged === null || merged !== (await ports.head(worktreePath)).trim()) return false;
  } else {
    if (ports.now() - await ports.modifiedAt(worktreePath) <= AGENT_IDLE_MS) return false;
    if (!(await ports.pushed(worktreePath))) return false;
  }
  return !(await ports.processIn(worktreePath));
}

// Which rule a folder answers to, by where it is; null for one that is neither's. A `.claude/worktrees`
// that resolves outside the project, a symlink to somewhere else, is not taken for the agents' folder.
function kindOf(path: string, projectPath: string): Kind | null {
  for (const [root, kind] of [[worktreesRoot(projectPath), 'card'], [join(projectPath, '.claude', 'worktrees'), 'agent']] as const) {
    const real = realPath(root);
    if (kind === 'agent' && !isInside(real, realPath(projectPath))) continue;
    if (path !== real && isInside(path, real)) return kind;
  }
  return null;
}

// One worktree at a time: every one of them is a gh call, and nothing is waiting on the answer.
export async function sweepLeftovers(ports: LeftoverPorts): Promise<void> {
  const open = ports.projectPaths();
  const passed = new Set([...ports.recorded(), ...open].map(realPath));
  for (const projectPath of open) {
    for (const worktree of await ports.list(projectPath)) {
      const path = realPath(worktree.worktreePath);
      const kind = kindOf(path, projectPath);
      // Also how two open projects of one repository each listing it ask about it once.
      if (passed.has(path) || kind === null) continue;
      passed.add(path);
      if (await isLeftover(ports, kind, worktree).catch(() => false)) await ports.remove(worktree.worktreePath, projectPath);
    }
  }
}
