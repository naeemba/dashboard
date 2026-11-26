import { basename, join } from 'node:path';
import { realPath } from '../app/real-path';
import { isInside } from '../panes/shell-directory';
import type { GitWorktree } from '../../shared/ship/git-worktrees';
import { worktreesRoot } from './ship';

// Worktrees beside an open project that nothing in the app will ever remove: a card's whose record
// went, or a throwaway made before throwaways were marked. Each is a full checkout with its
// node_modules; eight of them filled /home in two days in new-crm (2026-11-23). A marked throwaway
// (throwaway-marker.ts) is worktree.sweep's and its pane's, never this sweep's.
//
// One is removed only when nothing in it can be lost: no uncommitted change, no commit past the one its
// branch's pull request merged at (so no commit of it is anywhere the merge did not take), and no
// process on the machine standing in it. A change or commit of the board's files alone is nothing
// (workChanges says why). A worktree the app records is the review sweep's
// (review-flow.ts), which removes a card's once it is past Review, and keeps a cancelled one's.
// Only folders under `<project>.worktrees/`, where the app makes them: a worktree made by hand
// anywhere else is yours.
//
// And `<project>/.claude/worktrees/wf_*`, where a workflow's agents get theirs (`wf_<run>-<n>`): 27 of
// them, 135 MB to 2.2 GB each, in three days in new-crm. They have no pull request, so one goes when
// it is clean, its HEAD is on a remote (`rev-list HEAD --not --remotes` is empty), nobody stands in
// it, and nothing in it has changed for a day, which is how long a run gets to come back for it. Any
// other name there is an interactive session's (`claude --worktree <name>`), kept when it ended.
//
// A locked worktree (`git worktree lock`) is kept: the lock is somebody saying keep it. One whose
// removal git refuses anyway, a worktree with submodules, is not asked about again for the rest of
// the run, or every sweep would log the same refusal.

export type LeftoverPorts = {
  projectPaths: () => readonly string[];
  // The worktree paths the app records (worktrees.json).
  recorded: () => readonly string[];
  // The project's marked throwaways (throwawaysOf).
  throwaways: (projectPath: string) => Promise<string[]>;
  list: (projectPath: string) => Promise<GitWorktree[]>;
  // Changes past the board's (workChanges). True when git cannot say: silence is not no changes.
  dirty: (worktreePath: string) => Promise<boolean>;
  // The commit the branch's pull request merged at, or null while it is not merged (mergedHead).
  mergedHead: (worktreePath: string, branch: string) => Promise<string | null>;
  // Whether HEAD reaches a commit touching more than the board that is on no remote ref, nor reached
  // by `mergedAt` (unpushedWork).
  unpushed: (worktreePath: string, mergedAt?: string) => Promise<boolean>;
  // When the folder, or git's own record of it (index, HEAD), last changed, in milliseconds.
  modifiedAt: (worktreePath: string) => Promise<number>;
  now: () => number;
  // True when any process stands in the folder, or when that cannot be asked.
  processIn: (worktreePath: string) => Promise<boolean>;
  // worktree.remove, unforced: whether the folder went.
  remove: (worktreePath: string, projectPath: string) => Promise<boolean>;
};

export const AGENT_IDLE_MS = 24 * 60 * 60 * 1000;

type Kind = 'card' | 'agent';

// Cheapest question first: git status, then git or the forge (forge.ts), then the process table.
// One that throws keeps the worktree, and the next sweep asks again. A detached card worktree has no
// branch to ask the forge about, so it answers to the agents' rule: the one that sat in
// dashboard.worktrees/ a week (2026-11-24) was already on origin/main.
async function isLeftover(ports: LeftoverPorts, kind: Kind, { worktreePath, branch, locked, detached }: GitWorktree): Promise<boolean> {
  if (locked || await ports.dirty(worktreePath)) return false;
  if (kind === 'card' && !detached) {
    const merged = await ports.mergedHead(worktreePath, branch);
    if (merged === null || await ports.unpushed(worktreePath, merged)) return false;
  } else {
    if (ports.now() - await ports.modifiedAt(worktreePath) <= AGENT_IDLE_MS) return false;
    if (await ports.unpushed(worktreePath)) return false;
  }
  return !(await ports.processIn(worktreePath));
}

// Which rule a folder answers to, by where it is; null for one that is neither's. A `.claude/worktrees`
// that resolves outside the project, a symlink to somewhere else, is not taken for the agents' folder.
function kindOf(path: string, projectPath: string): Kind | null {
  for (const [root, kind] of [[worktreesRoot(projectPath), 'card'], [join(projectPath, '.claude', 'worktrees'), 'agent']] as const) {
    const real = realPath(root);
    if (kind === 'agent' && (!isInside(real, realPath(projectPath)) || !basename(path).startsWith('wf_'))) continue;
    if (path !== real && isInside(path, real)) return kind;
  }
  return null;
}

// One sweep per call, remembering across calls the worktrees git refused to remove. One worktree at
// a time: every one of them is a forge call, and nothing is waiting on the answer.
export function leftoverSweep(ports: LeftoverPorts): () => Promise<void> {
  const refused = new Set<string>();
  return async () => {
    const open = ports.projectPaths();
    const passed = new Set([...ports.recorded(), ...open].map(realPath));
    for (const projectPath of open) {
      for (const throwaway of await ports.throwaways(projectPath)) passed.add(realPath(throwaway));
      for (const worktree of await ports.list(projectPath)) {
        const path = realPath(worktree.worktreePath);
        const kind = kindOf(path, projectPath);
        // Also how two open projects of one repository each listing it ask about it once.
        if (passed.has(path) || refused.has(path) || kind === null) continue;
        passed.add(path);
        if (!(await isLeftover(ports, kind, worktree).catch(() => false))) continue;
        if (!(await ports.remove(worktree.worktreePath, projectPath))) refused.add(path);
      }
    }
  };
}
