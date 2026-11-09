import { formatSize } from '../ship/git-worktrees';

// What each pane's and session's systemd scope holds in memory, as main reads it from the scope's
// memory.current (src/main/processes/memory-sweep.ts) and the manager's rows and the status bar print
// it. docs/processes/README.md says which scopes count toward which pane.

// `bytes` is every recorded scope of the pane added up: a worker screen's hidden shell and its
// session. `high` is the MemoryHigh of the one capped among them, or null when none is capped (a
// user's shell, the editor).
export type PaneMemory = { bytes: number; high: number | null };

// By terminal id (`<slot>:<index>`, main's session at index 0). A pane with no scope recorded (a mac,
// Windows, a pane host from before scopes) is not in it.
export type MemorySnapshot = Record<string, PaneMemory>;

// How close to MemoryHigh counts as near: past it the kernel starts reclaiming from the agent and
// slows it, so the mark goes up while there is still room to act on it.
const NEAR_HIGH = 0.8;

export function nearHigh(memory: PaneMemory | undefined): memory is { bytes: number; high: number } {
  return memory !== undefined && memory.high !== null && memory.bytes >= memory.high * NEAR_HIGH;
}

// What the window draws of a snapshot, so a sweep that moved nothing on screen sends nothing. Sorted
// by id, since the sweep fills the snapshot in whatever order its reads finish.
export function drawnMemory(snapshot: MemorySnapshot): string {
  return JSON.stringify(Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)).map(([id, memory]) => [id, memoryText(memory), nearHigh(memory)]));
}

// What a row or the status bar prints: the figure in the worktree Size column's spelling, and the cap
// beside it once it is near (`5.1 GB of 6.0 GB`), so the mark says how close rather than only that it is.
export function memoryText(memory: PaneMemory | undefined): string {
  if (memory === undefined) return '';
  const figure = formatSize(memory.bytes);
  return nearHigh(memory) ? `${figure} of ${formatSize(memory.high)}` : figure;
}
