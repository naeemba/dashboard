import type { ShipRequest, ShipResult, WorktreeRemoval } from './bridge';
import { paneLabel } from '../panes/terminals';
import { failureText } from '../errors/failure';
import { isRecord } from './is-record';
import { errorDetail, type LogError } from './log-error';

// One line of the log, and every decision about the file that does not touch the disk. Shared: main
// writes entries and the renderer reads and filters them, so both sides import the one shape.
const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = typeof LOG_LEVELS[number];
const LOG_KINDS = ['app', 'project', 'pane', 'agent', 'card', 'ship', 'worktree', 'board', 'error', 'screen'] as const;
export type LogKind = typeof LOG_KINDS[number];

// Which process wrote it. Main stamps its own and the renderer's; the two hosts are named for when they
// report their own.
export type LogSource = 'main' | 'renderer' | 'screen-host' | 'pane-host';
// The ids the writer had to hand, so a line can be matched to the slot, pane, card or session it was
// about. Each only when known.
export type LogContext = { slot?: number; pane?: number; card?: string; session?: string };

// What a writer hands over. The time and the build are stamped where the line is written, so every
// entry in the file is on main's clock whichever side of the wire it came from. `message` is the one
// sentence a person reads; everything after it is detail for finding where it came from.
export type LogDraft = {
  level: LogLevel; kind: LogKind; project?: string; message: string;
  error?: LogError; source?: LogSource;
  // The action running when it was written (`project.close`), and the IPC channel of a failed invoke.
  action?: string; channel?: string;
  context?: LogContext;
};
// A line as it is read back. A level, kind or source this build does not know is kept as the text it
// is: a newer build wrote it, and a line dropped for its label is a line nobody can find.
export type LogEntry = Omit<LogDraft, 'level' | 'kind' | 'source'> & {
  time: string; level: string; kind: string; source?: string;
  // The app's `<version>+<commit>`, so a line says which build wrote it.
  build?: string;
};
// What the log section reads: the newest entries, oldest first, and where the file is for anything
// older than those.
export type LogRead = { file: string; entries: LogEntry[] };

export const LOG_FILE = 'dashboard.log';
export const LOG_FILE_COUNT = 5;
export const LOG_FILE_LIMIT = 5 * 1024 * 1024;
export const LOG_FILE_LIMIT_SHOWN = `${LOG_FILE_LIMIT / 1024 / 1024} MB`;
export const LOG_READ_COUNT = 1000;

// Undefined for anything that is not an entry. A crash mid-write leaves half a line at the end of the
// file, and a person may edit it by hand; either costs that one line, never the section. A key this
// build does not know is ignored, not refused.
export function parseLogLine(line: string): LogEntry | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  return readLogEntry(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readContext(value: unknown): LogContext | undefined {
  if (!isRecord(value)) return undefined;
  const context: LogContext = {};
  if (typeof value.slot === 'number') context.slot = value.slot;
  if (typeof value.pane === 'number') context.pane = value.pane;
  if (typeof value.card === 'string') context.card = value.card;
  if (typeof value.session === 'string') context.session = value.session;
  return Object.keys(context).length === 0 ? undefined : context;
}

// The fields every line and every draft share, read with the same checks and the same cuts, so
// neither the file nor another screen can put a megabyte stack in the log. Each new field is optional
// and a wrong-typed one is left off rather than costing the line. A wrong-typed level, kind or message
// does cost it: there would be nothing to show in the row.
function readBody(value: Record<string, unknown>): Omit<LogEntry, 'time' | 'build'> | undefined {
  const { level, kind, project, message } = value;
  if (typeof message !== 'string' || typeof level !== 'string' || typeof kind !== 'string') return undefined;
  if (project !== undefined && typeof project !== 'string') return undefined;
  return {
    level, kind, ...inProject(project), message,
    error: errorDetail(value.error), source: optionalText(value.source), action: optionalText(value.action),
    channel: optionalText(value.channel), context: readContext(value.context),
  };
}

export function readLogEntry(value: unknown): LogEntry | undefined {
  if (!isRecord(value) || typeof value.time !== 'string') return undefined;
  const body = readBody(value);
  return body && { ...body, time: value.time, build: optionalText(value.build) };
}

// A draft off the wire, as main writes it: held to the levels and kinds this build writes, since it is
// about to be written by this build. Its time, build and source are main's to stamp.
export function readLogDraft(value: unknown, source: LogSource): LogDraft | undefined {
  const body = isRecord(value) ? readBody(value) : undefined;
  if (body === undefined) return undefined;
  const { level, kind } = body;
  if (!LOG_LEVELS.some((known) => known === level) || !LOG_KINDS.some((known) => known === kind)) return undefined;
  return { ...body, level: level as LogLevel, kind: kind as LogKind, source };
}

// An IPC handler that threw. The renderer hears about it too, behind Electron's prefix and with its own
// stack; this line is the one with main's stack and the channel it came in on.
export function ipcFailureEntry(channel: string, error: unknown, action: string | undefined): LogDraft {
  return {
    level: 'error', kind: 'error', source: 'main', channel, action,
    message: `${channel} failed: ${failureText(error)}`, error: errorDetail(error),
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
    message: `${pane} exited (code ${exitCode})`, context: { pane: index },
  };
}

export function agentStartEntry(project: string | undefined, index: number): LogDraft {
  return {
    level: 'info', kind: 'agent', ...inProject(project), message: `agent started in ${paneLabel(index)}`, context: { pane: index },
  };
}

export function shipEntry(request: ShipRequest, result: ShipResult): LogDraft {
  const project = request.projectPath;
  const context = { slot: request.slot, card: request.cardId };
  if (result.ok) return { level: 'info', kind: 'ship', project, context, message: `"${request.title}" shipped on ${result.entry.branch}` };
  // Some of main's refusals already name the card, and naming it again reads `"Fix login" not shipped:
  // "Fix login" is on…`.
  const title = `"${request.title}"`;
  const message = result.message.includes(title) ? `not shipped: ${result.message}` : `${title} not shipped: ${result.message}`;
  return { level: 'error', kind: 'ship', project, context, message };
}

// A refusal is a warning: a worktree with changes in it asks you a second time, it does not fail.
export function removalEntry(projectPath: string, worktreePath: string, result: WorktreeRemoval): LogDraft {
  if (result.ok) return { level: 'info', kind: 'worktree', project: projectPath, message: `removed ${worktreePath}` };
  return { level: 'warn', kind: 'worktree', project: projectPath, message: `not removed ${worktreePath}: ${result.message}` };
}
