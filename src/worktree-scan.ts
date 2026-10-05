import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { git } from './git';
import { diskUsageBytes, parseWorktreeList, SIZE_STALE_MS, type ScannedWorktree } from './git-worktrees';
import { changedFiles } from './ship';
import { isStale } from './stale';

// The manager's scan: every worktree git knows of in each project, the ones a ship made and every other
// one, with whether each is dirty and its size. Main-process spawning, so it sits outside main.ts but
// carries no decision of its own — parsing and staleness are git-worktrees.ts's and stale.ts's.

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

// The last size measured for each folder. A size is a walk of every file in it, node_modules and all,
// so a folder is measured at most once every SIZE_STALE_MS in the background, and a scan answers with
// whatever was measured last — null for the first few seconds, then the number.
const sizes = new Map<string, { bytes: number | null; measuredAt: number }>();
const measuring = new Set<string>();
// One measure at a time: twenty multi-gigabyte walks at once is the whole disk for a few seconds.
let measured: Promise<unknown> = Promise.resolve();

function sizeOf(worktreePath: string): number | null {
  const known = sizes.get(worktreePath);
  if (!measuring.has(worktreePath) && isStale(known?.measuredAt, Date.now(), SIZE_STALE_MS)) {
    measuring.add(worktreePath);
    // du exits non-zero over a single unreadable file but still prints the total, so the output is
    // read off the failure as well.
    measured = measured.then(() => runFile('du', ['-sk', worktreePath]))
      .then(({ stdout }) => stdout, (error: { stdout?: string }) => error.stdout ?? '')
      .then((output) => sizes.set(worktreePath, { bytes: diskUsageBytes(output), measuredAt: Date.now() }))
      .finally(() => measuring.delete(worktreePath));
  }
  return known?.bytes ?? null;
}

// A removed folder's size is not kept for a worktree made later at the same path.
export function forgetSize(worktreePath: string): void {
  sizes.delete(worktreePath);
}

// A project git cannot list answers with nothing rather than failing the whole scan.
export async function scanWorktrees(projectPaths: readonly string[]): Promise<ScannedWorktree[]> {
  const listed = await Promise.all(projectPaths.map(async (projectPath) => {
    try {
      return parseWorktreeList(await git(['worktree', 'list', '--porcelain'], projectPath), projectPath);
    } catch {
      return [];
    }
  }));
  return Promise.all(listed.flat().map(async (worktree) => (
    { ...worktree, ...await worktreeState(worktree.worktreePath), bytes: sizeOf(worktree.worktreePath) }
  )));
}
