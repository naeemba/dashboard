import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { git, runProgram } from '../app/git';
import { realPath } from '../app/real-path';
import { processTree } from '../panes/process-tree';
import { directoriesOf } from '../panes/shell-directory-lookup';
import { isInside } from '../panes/shell-directory';
import { parentProcesses } from '../workers/pane-sessions';
import { mergedHead, unpushedWork } from '../workers/finished-work';
import { throwawaysOf } from '../workers/throwaway-marker';
import { isRefused, type BoundAction } from '../actions/action';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { leftoverSweep } from './leftover-worktrees';
import { workChanges } from './ship';
import { listWorktrees } from './worktree-scan';

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

// The newest of the folder's own mtime and git's index and HEAD for it: a commit, a checkout or a
// staged change touches one of those even when it leaves the folder's own entry alone.
async function modifiedAt(worktreePath: string): Promise<number> {
  const gitFolder = (await git(['rev-parse', '--absolute-git-dir'], worktreePath)).trim();
  const times = await Promise.all([worktreePath, join(gitFolder, 'index'), join(gitFolder, 'HEAD')]
    .map((path) => stat(path).then((found) => found.mtimeMs, () => 0)));
  return Math.max(...times);
}

export function startLeftoverSweep(main: {
  remove: BoundAction<{ ok: boolean; output: string }>;
  records: () => readonly WorktreeEntry[];
  projects: () => readonly string[];
}): void {
  const sweep = leftoverSweep({
    projectPaths: main.projects,
    recorded: () => main.records().map((entry) => entry.worktreePath),
    throwaways: throwawaysOf,
    list: listWorktrees,
    // Untracked files named outright, whatever status.showUntrackedFiles says. A git that cannot
    // answer throws, which keeps the worktree.
    dirty: async (worktreePath) => workChanges(await git(['status', '--porcelain', '--untracked-files=normal'], worktreePath)).length > 0,
    mergedHead: (worktreePath, branch) => mergedHead(runProgram, worktreePath, branch),
    unpushed: async (worktreePath, mergedAt) => (await unpushedWork(runProgram, worktreePath, mergedAt)) !== 0,
    modifiedAt,
    now: Date.now,
    processIn,
    remove: async (worktreePath, projectPath) => {
      const removal = await main.remove.call({ worktreePath, projectPath, from: 'leftover' });
      return !isRefused(removal) && removal.ok;
    },
  });
  const run = () => sweep().catch(() => undefined);
  setTimeout(run, FIRST_MS).unref();
  setInterval(run, EVERY_MS).unref();
}
