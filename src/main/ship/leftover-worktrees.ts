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
  // True when any process stands in the folder, or when that cannot be asked.
  processIn: (worktreePath: string) => Promise<boolean>;
  // worktree.remove, unforced.
  remove: (worktreePath: string, projectPath: string) => Promise<unknown>;
};

// Cheapest question first: git status, then gh, then the process table. One that throws keeps the
// worktree, and the next sweep asks again.
async function isLeftover(ports: LeftoverPorts, { worktreePath, branch }: GitWorktree): Promise<boolean> {
  if (await ports.dirty(worktreePath)) return false;
  const merged = await ports.mergedHead(worktreePath, branch);
  if (merged === null || merged !== (await ports.head(worktreePath)).trim()) return false;
  return !(await ports.processIn(worktreePath));
}

// One worktree at a time: every one of them is a gh call, and nothing is waiting on the answer.
export async function sweepLeftovers(ports: LeftoverPorts): Promise<void> {
  const open = ports.projectPaths();
  const passed = new Set([...ports.recorded(), ...open].map(realPath));
  for (const projectPath of open) {
    const root = realPath(worktreesRoot(projectPath));
    for (const worktree of await ports.list(projectPath)) {
      const path = realPath(worktree.worktreePath);
      // Also how two open projects of one repository each listing it ask about it once.
      if (passed.has(path) || path === root || !isInside(path, root)) continue;
      passed.add(path);
      if (await isLeftover(ports, worktree).catch(() => false)) await ports.remove(worktree.worktreePath, projectPath);
    }
  }
}
