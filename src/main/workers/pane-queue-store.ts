import { isRecord } from '../../shared/app/is-record';
import { isFilledText, isFilledTextOrNull } from '../actions/pane/pane-input';
import { replaceFile } from '../app/replace-file';
import { readText } from '../app/missing-file';
import { columnsBack, queuedWork, type QueueEntry } from './pane-pool';

// pane-queue.json in the app's user data, next to session.json: the pane pool's queue, written on every
// change, so an app restart never loses work a main was told is queued. Read once at launch.

export type SavedQueue = { next: number; entries: QueueEntry[] };

function entry(stored: unknown): QueueEntry[] {
  if (!isRecord(stored)) return [];
  const { id, dispatcherPath, projectPath, cardId, after, queuedAt } = stored;
  const returnTo = stored.returnTo === undefined ? null : columnsBack(stored.returnTo);
  const queued = queuedWork(stored.work);
  if (!isFilledText(id) || !isFilledText(dispatcherPath) || !isFilledText(projectPath) || !isFilledTextOrNull(cardId) || !isFilledTextOrNull(after) || !isFilledText(queuedAt) || queued === undefined || returnTo === undefined) return [];
  return [{ id, dispatcherPath, projectPath, cardId, after, queuedAt, work: queued, returnTo }];
}

// The file's queue, an entry that does not read left out. No file, or one that does not parse, is an
// empty queue, as on a first launch.
export function parseQueue(stored: unknown): SavedQueue {
  if (!isRecord(stored)) return { next: 1, entries: [] };
  const next = typeof stored.next === 'number' && Number.isInteger(stored.next) && stored.next >= 1 ? stored.next : 1;
  return { next, entries: Array.isArray(stored.entries) ? stored.entries.flatMap(entry) : [] };
}

export function readQueue(file: string): SavedQueue {
  try {
    return parseQueue(JSON.parse(readText(file) ?? 'null'));
  } catch {
    return { next: 1, entries: [] };
  }
}

export function writeQueue(file: string, saved: SavedQueue): void {
  replaceFile(file, `${JSON.stringify(saved, null, 2)}\n`);
}

export const PANE_QUEUE_FILE = 'pane-queue.json';
