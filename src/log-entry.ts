import type { ShipRequest, ShipResult, WorktreeRemoval } from './bridge';
import { paneLabel } from './terminals';

// One line of the log, and every decision about the file that does not touch the disk. Shared: main
// writes entries and the renderer reads and filters them, so both sides import the one shape.
export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export const LOG_KINDS = ['app', 'project', 'pane', 'agent', 'card', 'ship', 'worktree', 'board', 'error'] as const;
export type LogKind = typeof LOG_KINDS[number];

export type LogEntry = { time: string; level: LogLevel; kind: LogKind; project?: string; message: string };
// What a writer hands over. The time is stamped where the line is written, so every entry in the file
// is on main's clock whichever side of the wire it came from.
export type LogDraft = Omit<LogEntry, 'time'>;
// What the log section reads: the newest entries, oldest first, and where the file is for anything
// older than those.
export type LogRead = { file: string; entries: LogEntry[] };

export const LOG_FILE = 'dashboard.log';
export const LOG_FILE_COUNT = 5;
export const LOG_FILE_LIMIT = 5 * 1024 * 1024;
export const LOG_READ_COUNT = 1000;

// Undefined for anything that is not an entry. A crash mid-write leaves half a line at the end of the
// file, and a person may edit it by hand; either costs that one line, never the section.
export function parseLogLine(line: string): LogEntry | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { time, level, kind, project, message } = value as Record<string, unknown>;
  if (typeof time !== 'string' || typeof message !== 'string') return undefined;
  if (!LOG_LEVELS.some((known) => known === level) || !LOG_KINDS.some((known) => known === kind)) return undefined;
  if (project !== undefined && typeof project !== 'string') return undefined;
  return {
    time, level: level as LogLevel, kind: kind as LogKind, ...inProject(project), message,
  };
}

// The live file first, the oldest last: rotation renames each one a place down this list.
export function logFileNames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => (index === 0 ? base : `${base}.${index}`));
}

// An empty file is never rotated, so one entry bigger than the limit is written rather than pushing
// every older file off the end on its way to a file it still does not fit in.
export function needsRotation(currentSize: number, appendSize: number, limit: number): boolean {
  return currentSize > 0 && currentSize + appendSize > limit;
}

// Every word of the query, anywhere in the row as it reads. `error ship` is the failed ships.
export function matchesLogFilter(entry: LogEntry, query: string): boolean {
  const text = [entry.level, entry.kind, entry.project ?? '', entry.message].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter((word) => word !== '').every((word) => text.includes(word));
}

function inProject(project: string | undefined): { project?: string } {
  return project === undefined ? {} : { project };
}

// A non-zero exit is a warning, not an error: a shell you typed `exit 1` into is not the app failing.
export function paneExitEntry(project: string | undefined, index: number, exitCode: number, wasAgent: boolean): LogDraft {
  const pane = wasAgent ? `agent in ${paneLabel(index)}` : paneLabel(index);
  return {
    level: exitCode === 0 ? 'info' : 'warn', kind: wasAgent ? 'agent' : 'pane', ...inProject(project),
    message: `${pane} exited (code ${exitCode})`,
  };
}

export function agentStartEntry(project: string | undefined, index: number): LogDraft {
  return { level: 'info', kind: 'agent', ...inProject(project), message: `agent started in ${paneLabel(index)}` };
}

export function shipEntry(request: ShipRequest, result: ShipResult): LogDraft {
  const project = request.projectPath;
  if (result.ok) return { level: 'info', kind: 'ship', project, message: `"${request.title}" shipped on ${result.entry.branch}` };
  // Some of main's refusals already name the card, and naming it again reads `"Fix login" not shipped:
  // "Fix login" is on…`.
  const title = `"${request.title}"`;
  const message = result.message.includes(title) ? `not shipped: ${result.message}` : `${title} not shipped: ${result.message}`;
  return { level: 'error', kind: 'ship', project, message };
}

// A refusal is a warning: a worktree with changes in it asks you a second time, it does not fail.
export function removalEntry(projectPath: string, worktreePath: string, result: WorktreeRemoval): LogDraft {
  if (result.ok) return { level: 'info', kind: 'worktree', project: projectPath, message: `removed ${worktreePath}` };
  return { level: 'warn', kind: 'worktree', project: projectPath, message: `not removed ${worktreePath}: ${result.message}` };
}
