import type { WorktreeEntry } from './worktree-store';

// The two rulings the worktree dialog makes about a row before it draws one: what order the rows go
// in, and what the dirty cell is allowed to say. Out of the dialog because both are decisions with a
// reason behind them that nothing on screen explains, and neither can be tested inside a closure.

// Newest first, ordered here rather than inherited from the store. `withEntry` moves a replaced entry
// to the end of its array, so leaving the order alone would mean the list re-sorts itself whenever a
// record is touched — a row jumping to the bottom because its ship found a pane.
//
// A copy, because the caller's array is the record it holds and sorting is in place.
export function orderedWorktrees(entries: readonly WorktreeEntry[]): WorktreeEntry[] {
  return [...entries].sort((first, second) => second.startedAt.localeCompare(first.startedAt));
}

// What the dirty cell says. Three states, not two, and the third is the point: `unreadable` is a
// worktree git could not answer for — moved, deleted, permissions — and calling that one clean would
// be the dialog claiming something it does not know, about the row `d` is aimed at. "…" is the first
// paint, before the first answer has come back; the cell holds its last answer while a later check is
// in flight rather than blanking.
export function dirtyLabel(
  worktreePath: string,
  checked: boolean,
  dirty: ReadonlySet<string>,
  unreadable: ReadonlySet<string>,
): string {
  if (!checked) return '…';
  if (unreadable.has(worktreePath)) return 'unknown';
  return dirty.has(worktreePath) ? 'DIRTY' : 'clean';
}
