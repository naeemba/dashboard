import { isPaneConversation } from './claude-resume';
import { isRecord } from '../../shared/app/is-record';
import type { SessionList, SessionRecord } from '../../shared/drawer/drawer';

// The app's own record of every Claude conversation it started, by project, which is what the drawer
// lists and resumes from. Kept in the app's user data, never in .dashboard/: sessions are one person's
// and board.json is tracked. session-index-store.ts is the file; this is every rule about its rows.

export type SessionIndex = Readonly<Record<string, readonly SessionRecord[]>>;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// A row read back from disk. The id is typed into a shell by a resume, so it is held to the shape
// claude-resume.ts holds every resumed id to; anything else in a hand-edited file is dropped.
function isSessionRecord(value: unknown): value is SessionRecord {
  if (!isRecord(value)) return false;
  const { id, label, directory, card, startedAt, lastUsedAt } = value;
  return isPaneConversation({ session: id, directory })
    && typeof label === 'string' && label !== ''
    && (card === null || typeof card === 'string')
    && isNumber(startedAt) && isNumber(lastUsedAt);
}

export function parseSessionIndex(value: unknown): SessionIndex {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([projectPath, rows]) => (
    Array.isArray(rows) ? [[projectPath, rows.filter(isSessionRecord)]] : []
  )));
}

// A conversation the app started or saw begin: a new row labelled `<slug>-<n>`, or, for an id the
// project already has, the same row used again. `n` counts the project's rows, which are never removed,
// so a label is never handed out twice.
export function withSession(
  index: SessionIndex, projectPath: string, slug: string,
  session: { id: string; directory: string; card: string | null; at: number },
): SessionIndex {
  const rows = index[projectPath] ?? [];
  if (rows.some((row) => row.id === session.id)) return withUse(index, projectPath, session.id, session.at);
  const row: SessionRecord = {
    id: session.id, label: `${slug}-${rows.length + 1}`, directory: session.directory, card: session.card,
    startedAt: session.at, lastUsedAt: session.at,
  };
  return { ...index, [projectPath]: [...rows, row] };
}

function withRow(index: SessionIndex, projectPath: string, id: string, change: (row: SessionRecord) => SessionRecord): SessionIndex {
  const rows = index[projectPath];
  if (rows === undefined || !rows.some((row) => row.id === id)) return index;
  return { ...index, [projectPath]: rows.map((row) => (row.id === id ? change(row) : row)) };
}

export function withUse(index: SessionIndex, projectPath: string, id: string, at: number): SessionIndex {
  return withRow(index, projectPath, id, (row) => ({ ...row, lastUsedAt: Math.max(row.lastUsedAt, at) }));
}

// The live sessions a token sweep found, each marked used now in whichever project holds it. The same
// index back when none of them is one of the app's, so the caller can skip a write that changes nothing.
export function withLive(index: SessionIndex, live: Iterable<string>, at: number): SessionIndex {
  const ids = new Set(live);
  let next = index;
  for (const [projectPath, rows] of Object.entries(index)) {
    for (const row of rows) if (ids.has(row.id) && row.lastUsedAt < at) next = withUse(next, projectPath, row.id, at);
  }
  return next;
}

// A rename from the drawer, or the sentence saying why not.
export function renamed(index: SessionIndex, projectPath: string, id: string, label: string): SessionIndex | string {
  const trimmed = label.trim();
  if (trimmed === '') return 'A session needs a name — Escape keeps the one it has';
  if (!(index[projectPath] ?? []).some((row) => row.id === id)) return 'That session is not in this project any more';
  return withRow(index, projectPath, id, (row) => ({ ...row, label: trimmed }));
}

// The `count` most recently used, newest first, and whether older ones are left.
export function sessionPage(index: SessionIndex, projectPath: string, count: number): SessionList {
  const rows = [...(index[projectPath] ?? [])].sort((one, other) => other.lastUsedAt - one.lastUsedAt);
  return { rows: rows.slice(0, count), more: rows.length > count };
}

// Why a session cannot be resumed into a new worker, or null when it can. A resume of a conversation
// still running would put two Claudes on one conversation, each writing its own turns into it.
export function resumeRefusal(
  record: SessionRecord | undefined,
  folderExists: (directory: string) => boolean,
  runningIn: string | null,
): string | null {
  if (record === undefined) return 'That session is not in this project any more';
  if (runningIn !== null) return `${record.label} is still running in ${runningIn}`;
  if (!folderExists(record.directory)) return `${record.label} ran in ${record.directory}, which is gone`;
  return null;
}
