import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { WORK_STATUS, isBoardPath } from './ship';
import { git } from '../app/git';

// The review's swap carries a worktree's untracked files across rather than stopping on them
// (ship-decision-8). A finished worker's worktree that holds nothing but untracked files is almost
// always holding what a tool wrote there: Next.js 16 writes an AGENTS.md on every dev server or build,
// and five worktrees of one project sat on it a night with their reviews waiting (2026-11-28).
// Carried rather than deleted, so a new file the agent forgot to add is still there for the review.

// The untracked files to carry, from `git status --porcelain -z`: none while any tracked file is
// changed too, because git refuses the removal on that anyway and the swap would move them out and
// back on every tick for nothing. The board's files are the removal's own question (ship-decision-7).
// -z because these paths go to `rename`: the plain format C-quotes a name like `café.md` into
// `"caf\303\251.md"`, a file that does not exist. Under -z a rename or copy is `XY new\0old\0`.
const CARRY_STATUS: readonly string[] = [...WORK_STATUS, '-z'];

export function carriedFiles(status: string): string[] {
  const entries = status.split('\0');
  const untracked: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.length <= 3) continue;
    const path = entry.slice(3);
    if (/[RC]/.test(entry.slice(0, 2))) index++;
    if (isBoardPath(path)) continue;
    if (!entry.startsWith('??')) return [];
    untracked.push(path);
  }
  return untracked;
}

// The worktree's carried files moved into a folder beside it, and `restore` moving them back into the
// same path once the swap has checked the branch out there again (or once it was refused). A rename,
// so the folder is a sibling: the same disk, and outside the worktree git is about to delete.
// ponytail: a swap whose checkout throws leaves the files in `<worktree>.untracked-*` beside it; say so on the card if that ever happens.
export async function setAsideUntracked(worktreePath: string): Promise<{ files: string[]; restore: () => Promise<void> }> {
  // A folder already gone has nothing to carry, and git spawned in it fails with `spawn git ENOENT`
  // before the keeper's unforced removal can prune it (worktree-keeper.ts asks the same).
  if (!existsSync(worktreePath)) return { files: [], restore: async () => undefined };
  const files = carriedFiles(await git([...CARRY_STATUS], worktreePath));
  if (files.length === 0) return { files, restore: async () => undefined };
  const aside = await mkdtemp(join(dirname(worktreePath), `${basename(worktreePath)}.untracked-`));
  // `git status` names an untracked folder with a slash on the end, and the folder moves whole.
  const paths = files.map((file) => file.replace(/\/$/, ''));
  try {
    await moveAll(paths, worktreePath, aside);
  } catch (error) {
    await rm(aside, { recursive: true, force: true });
    throw error;
  }
  return {
    files,
    restore: async () => {
      await moveAll(paths, aside, worktreePath);
      await rm(aside, { recursive: true, force: true });
    },
  };
}

// All of them or none: a rename that throws part way moves back what was already moved, so a failure
// leaves `from` as it was rather than files stranded where nothing points.
export async function moveAll(paths: readonly string[], from: string, to: string): Promise<void> {
  const moved: string[] = [];
  try {
    for (const path of paths) {
      await mkdir(dirname(join(to, path)), { recursive: true });
      await rename(join(from, path), join(to, path));
      moved.push(path);
    }
  } catch (error) {
    for (const path of moved.reverse()) await rename(join(to, path), join(from, path));
    throw error;
  }
}
