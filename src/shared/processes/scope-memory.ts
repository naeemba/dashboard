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

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

// `2.1G`, `640M`; empty for no reading, so a pane without a scope prints nothing.
export function formatMemory(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)}G`;
  return `${Math.max(1, Math.round(bytes / MIB))}M`;
}

export function nearHigh(memory: PaneMemory | undefined): boolean {
  return memory !== undefined && memory.high !== null && memory.bytes >= memory.high * NEAR_HIGH;
}

// What a row or the status bar prints: the figure, and the cap beside it once it is near (`5.1G of
// 6G`), so the mark says how close rather than only that it is.
export function memoryText(memory: PaneMemory | undefined): string {
  if (memory === undefined) return '';
  const figure = formatMemory(memory.bytes);
  return nearHigh(memory) && memory.high !== null ? `${figure} of ${Math.round(memory.high / GIB)}G` : figure;
}
