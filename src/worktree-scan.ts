import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { git } from './git';
import { diskUsageBytes, distinctWorktrees, parseWorktreeList, type ScannedWorktree } from './git-worktrees';
import { changedFiles } from './ship';
import { createWorktreeSizes } from './worktree-sizes';

// The manager's scan: every worktree git knows of in each project, the ones a ship made and every other
// one, with whether each is dirty and its size. Main-process spawning, so it sits outside main.ts but
// carries no decision of its own — parsing and matching are git-worktrees.ts's, when to measure a size
// is worktree-sizes.ts's.

// Not commandOutput: that gives up after two seconds, and a folder with node_modules in it takes longer.
const runFile = promisify(execFile);

// Whether a worktree has uncommitted changes, or git could not answer for it. changedFiles is the
// predicate worktree:remove asks, so a row and the removal it offers agree on what is in the way. A
// worktree git cannot read comes back unreadable rather than clean: silence is not no changes.
export async function worktreeState(worktreePath: string): Promise<{ dirty: boolean; unreadable: boolean }> {
  try {
    return { dirty: changedFiles(await git(['status', '--porcelain'], worktreePath)).length > 0, unreadable: false };
  } catch {
    return { dirty: false, unreadable: true };
  }
}

// du exits non-zero over a single unreadable file but still prints the total, so the output is read
// off the failure as well. When to measure and which answer to keep is worktree-sizes.ts's.
const sizes = createWorktreeSizes({
  now: Date.now,
  measure: (worktreePath) => runFile('du', ['-sk', worktreePath])
    .then(({ stdout }) => stdout, (error: { stdout?: string }) => error.stdout ?? '')
    .then(diskUsageBytes),
});

export const forgetSize = sizes.forget;

// git prints real paths, so a path is compared in that spelling. One that cannot be resolved — a
// folder gone — is compared as given.
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// A project git cannot list answers with nothing rather than failing the whole scan. `recordedPaths`
// are the app's own records, so a worktree git lists is answered under the path its record spells.
export async function scanWorktrees(
  projectPaths: readonly string[], recordedPaths: readonly string[],
): Promise<ScannedWorktree[]> {
  const listed = await Promise.all(projectPaths.map(async (projectPath) => {
    try {
      return parseWorktreeList(
        await git(['worktree', 'list', '--porcelain'], projectPath), projectPath, realPath(projectPath),
      );
    } catch {
      return [];
    }
  }));
  const spelling = new Map(recordedPaths.map((path) => [realPath(path), path]));
  return Promise.all(distinctWorktrees(listed.flat(), spelling).map(async (worktree) => (
    { ...worktree, ...await worktreeState(worktree.worktreePath), bytes: sizes.sizeOf(worktree.worktreePath) }
  )));
}
