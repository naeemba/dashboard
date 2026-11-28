import { mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { changedFiles, isBoardPath, WORK_STATUS } from './ship';
import { git } from '../app/git';

// The review's swap carries a worktree's untracked files across rather than stopping on them
// (ship-decision-8). A finished worker's worktree that holds nothing but untracked files is almost
// always holding what a tool wrote there: Next.js 16 writes an AGENTS.md on every dev server or build,
// and five worktrees of one project sat on it a night with their reviews waiting (2026-11-28).
// Carried rather than deleted, so a new file the agent forgot to add is still there for the review.

// The untracked files to carry, from `git status --porcelain`: none while any tracked file is
// changed too, because git refuses the removal on that anyway and the swap would move them out and
// back on every tick for nothing. The board's files are the removal's own question (ship-decision-7).
export function carriedFiles(porcelain: string): string[] {
  const lines = porcelain.split('\n').filter((line) => line.length > 3);
  const untracked = (line: string) => line.startsWith('??');
  const tracked = changedFiles(lines.filter((line) => !untracked(line)).join('\n')).filter((path) => !isBoardPath(path));
  if (tracked.length > 0) return [];
  return changedFiles(lines.filter(untracked).join('\n')).filter((path) => !isBoardPath(path));
}

// The worktree's carried files moved into a folder beside it, and `restore` moving them back into the
// same path once the swap has checked the branch out there again (or once it was refused). A rename,
// so the folder is a sibling: the same disk, and outside the worktree git is about to delete.
// ponytail: a swap whose checkout throws leaves the files in `<worktree>.untracked-*` beside it; say so on the card if that ever happens.
export async function setAsideUntracked(worktreePath: string): Promise<{ files: string[]; restore: () => Promise<void> }> {
  const files = carriedFiles(await git([...WORK_STATUS], worktreePath));
  if (files.length === 0) return { files, restore: async () => undefined };
  const aside = await mkdtemp(join(dirname(worktreePath), `${basename(worktreePath)}.untracked-`));
  // `git status` names an untracked folder with a slash on the end, and the folder moves whole.
  const paths = files.map((file) => file.replace(/\/$/, ''));
  await moveAll(paths, worktreePath, aside);
  return {
    files,
    restore: async () => {
      await moveAll(paths, aside, worktreePath);
      await rm(aside, { recursive: true, force: true });
    },
  };
}

async function moveAll(paths: readonly string[], from: string, to: string): Promise<void> {
  for (const path of paths) {
    await mkdir(dirname(join(to, path)), { recursive: true });
    await rename(join(from, path), join(to, path));
  }
}
