import { readFileSync, writeFileSync } from 'node:fs';

// What is in flight right now: one entry per worktree the app has made. Kept beside session.json and
// recents.json in the app's own folder rather than in the project, because it describes checkouts on
// this machine. Nothing here is ever committed, so it can never take part in a merge.
//
// The board on main says what has been merged. This file is what stops that being the whole truth on
// screen: a card whose work is under way draws its badge from here.
export type WorktreeEntry = {
  cardId: string;
  title: string;
  projectPath: string;
  branch: string;
  worktreePath: string;
  // The pane running the agent, or null when the worktree was made and every pane was already in
  // use. Null is a real state, not a missing field.
  pane: number | null;
  startedAt: string;
};

const TEXT_FIELDS = ['cardId', 'title', 'projectPath', 'branch', 'worktreePath', 'startedAt'] as const;

function isPane(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// Every field but the pane names something the entry cannot do without: which card, which folder,
// which branch. One of them missing leaves a row that cannot be drawn, jumped to or removed, so the
// entry goes rather than sitting there doing nothing.
function toEntry(stored: unknown): WorktreeEntry | null {
  const record = (stored ?? {}) as Record<string, unknown>;
  if (TEXT_FIELDS.some((field) => typeof record[field] !== 'string' || record[field] === '')) return null;
  return {
    cardId: record.cardId as string,
    title: record.title as string,
    projectPath: record.projectPath as string,
    branch: record.branch as string,
    worktreePath: record.worktreePath as string,
    pane: isPane(record.pane) ? record.pane : null,
    startedAt: record.startedAt as string,
  };
}

export function parseWorktrees(stored: unknown): WorktreeEntry[] {
  const { entries } = (stored ?? {}) as { entries?: unknown };
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => toEntry(entry) ?? []);
}

// Like the session and the recents, this is a convenience rather than state to recover: a missing or
// damaged file means nothing is recorded, and a write that fails must not take down the ship that was
// otherwise finished.
export function readWorktrees(file: string): WorktreeEntry[] {
  try {
    return parseWorktrees(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

export function writeWorktrees(file: string, entries: WorktreeEntry[]): void {
  try {
    writeFileSync(file, JSON.stringify({ entries }, null, 2));
  } catch {
    // Nothing recorded this time.
  }
}

export function entryForCard(
  entries: readonly WorktreeEntry[],
  cardId: string,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.cardId === cardId);
}

// One entry per card. The ship writes twice — once when the worktree exists, again when a pane has
// taken it — and the second write must replace the first rather than making a second row.
export function withEntry(entries: readonly WorktreeEntry[], entry: WorktreeEntry): WorktreeEntry[] {
  const others = entries.filter((existing) => existing.cardId !== entry.cardId);
  return [...others, entry];
}

export function withoutWorktree(
  entries: readonly WorktreeEntry[],
  worktreePath: string,
): WorktreeEntry[] {
  return entries.filter((entry) => entry.worktreePath !== worktreePath);
}

// A worktree removed by hand — `git worktree remove`, or an `rm -rf` — must not leave its card marked
// as in flight forever, refusing every later ship of it with nothing on screen able to clear it.
export function livingEntries(
  entries: readonly WorktreeEntry[],
  exists: (path: string) => boolean,
): WorktreeEntry[] {
  return entries.filter((entry) => exists(entry.worktreePath));
}
