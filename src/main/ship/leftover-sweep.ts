import { git, runProgram } from '../app/git';
import { realPath } from '../app/real-path';
import { processTree } from '../panes/process-tree';
import { directoriesOf } from '../panes/shell-directory-lookup';
import { isInside } from '../panes/shell-directory';
import { parentProcesses } from '../workers/pane-sessions';
import { mergedHead } from '../workers/finished-work';
import type { BoundAction } from '../actions/action';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { sweepLeftovers } from './leftover-worktrees';
import { listWorktrees, worktreeState } from './worktree-scan';

// Main's wiring for the leftover sweep (leftover-worktrees.ts): a minute after launch, once the
// projects have opened, then every half hour. Spawning only; every decision is next door.

const FIRST_MS = 60_000;
const EVERY_MS = 30 * 60_000;

// Every process on the machine, not only the panes' shells: a dev server started from another
// terminal stands in a worktree as surely as one of the app's. Not knowing is somebody there.
async function processIn(worktreePath: string): Promise<boolean> {
  const tree = process.platform === 'win32' ? null : await processTree();
  if (tree === null) return true;
  const directories = await directoriesOf([...parentProcesses(tree).keys()]);
  if (directories === null) return true;
  const real = realPath(worktreePath);
  return [...directories.values()].some((directory) => isInside(directory, worktreePath) || isInside(directory, real));
}

export function startLeftoverSweep(main: {
  remove: BoundAction;
  records: () => readonly WorktreeEntry[];
  projects: () => readonly string[];
}): void {
  const run = () => sweepLeftovers({
    projectPaths: main.projects,
    recorded: () => main.records().map((entry) => entry.worktreePath),
    list: listWorktrees,
    dirty: async (worktreePath) => {
      const state = await worktreeState(worktreePath);
      return state.dirty || state.unreadable;
    },
    head: (worktreePath) => git(['rev-parse', 'HEAD'], worktreePath),
    mergedHead: (worktreePath, branch) => mergedHead(runProgram, worktreePath, branch),
    processIn,
    remove: (worktreePath, projectPath) => main.remove.call({ worktreePath, projectPath, from: 'sweep' }),
  }).catch(() => undefined);
  setTimeout(run, FIRST_MS).unref();
  setInterval(run, EVERY_MS).unref();
}
