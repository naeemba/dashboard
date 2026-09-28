import { paneLabel } from './terminals';
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

// What the manager's Worktrees figure says under it about a set of worktrees, and whether it asks to
// be looked at. The same three states dirtyLabel reads, added up: a worktree git could not answer for
// is counted as unknown rather than folded into `nothing uncommitted`, and before the first answer
// there is nothing to add up.
export function dirtySummary(
  worktreePaths: readonly string[],
  checked: boolean,
  dirty: ReadonlySet<string>,
  unreadable: ReadonlySet<string>,
): { text: string; attention: boolean } {
  if (!checked) return { text: 'checking…', attention: false };
  const dirtyCount = worktreePaths.filter((path) => dirty.has(path)).length;
  const unknownCount = worktreePaths.filter((path) => unreadable.has(path)).length;
  const parts = [
    ...dirtyCount > 0 ? [`${dirtyCount} with uncommitted changes`] : [],
    ...unknownCount > 0 ? [`${unknownCount} unknown`] : [],
  ];
  return parts.length === 0
    ? { text: 'nothing uncommitted', attention: false }
    : { text: parts.join(' · '), attention: true };
}

// Which pane the worktree's agent runs in. Both lists of worktrees print it — the dialog and the
// manager — so the wording for a worktree that has none lives here once.
export function worktreePaneText(entry: WorktreeEntry): string {
  return entry.pane === null ? 'no pane' : paneLabel(entry.pane);
}
