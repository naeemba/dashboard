import { SIZE_STALE_MS, type WorktreeSize } from './git-worktrees';
import { isStale } from './stale';

// When a worktree's folder is measured, and which measure's answer is kept. A size is a walk of every
// file in the folder, node_modules and all, so a folder is measured at most once every SIZE_STALE_MS
// in the background, and asking answers with whatever was measured last — null for the first few
// seconds, then the number.
//
// `measure` answers null when the walk gave no number. worktree-scan.ts hands in `du`.
export type SizePorts = { now: () => number; measure: (worktreePath: string) => Promise<number | null> };

export function createWorktreeSizes(ports: SizePorts) {
  const sizes = new Map<string, { bytes: WorktreeSize; measuredAt: number }>();
  // A folder already being walked is not queued again: its measuredAt is only set when the walk ends,
  // so staleness alone would queue a fresh walk on every scan until the first one finished.
  const measuring = new Set<string>();
  // Bumped by forget, so a walk that started before a removal does not store the old folder's total
  // against a worktree made later at the same path.
  const generations = new Map<string, number>();
  // One measure at a time: twenty multi-gigabyte walks at once is the whole disk for a few seconds.
  let queue: Promise<unknown> = Promise.resolve();

  function sizeOf(worktreePath: string): WorktreeSize {
    const known = sizes.get(worktreePath);
    if (!measuring.has(worktreePath) && isStale(known?.measuredAt, ports.now(), SIZE_STALE_MS)) {
      measuring.add(worktreePath);
      const generation = generations.get(worktreePath) ?? 0;
      queue = queue
        .then(() => ports.measure(worktreePath))
        .catch(() => null)
        .then((bytes) => {
          if ((generations.get(worktreePath) ?? 0) !== generation) return;
          sizes.set(worktreePath, { bytes: bytes ?? 'unmeasurable', measuredAt: ports.now() });
        })
        .finally(() => measuring.delete(worktreePath));
    }
    return known?.bytes ?? null;
  }

  // A removed folder's size is not kept for a worktree made later at the same path.
  function forget(worktreePath: string): void {
    sizes.delete(worktreePath);
    generations.set(worktreePath, (generations.get(worktreePath) ?? 0) + 1);
  }

  return { sizeOf, forget };
}
