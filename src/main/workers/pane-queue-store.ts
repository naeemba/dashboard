import path from 'node:path';
import type { Refused } from '../../shared/app/bridge';
import { isRecord } from '../../shared/app/is-record';
import type { Board } from '../../shared/board/board';
import { isPaneKindOrNull } from '../../shared/panes/pane-kind';
import type { Settings } from '../../shared/settings/settings';
import type { PaneQueuePorts } from '../actions/pane/queue';
import { replaceFile } from '../app/replace-file';
import { readText } from '../app/missing-file';
import { budgetVerdict } from '../command/budget-cli';
import { WEEKLY_USAGE_FILE } from '../usage/weekly-usage-file';
import { budgetHold, type QueueEntry, type QueuedWork } from './pane-pool';

// pane-queue.json in the app's user data, next to session.json: the pane pool's queue, written on every
// change, so an app restart never loses work a main was told is queued. Read once at launch.

export type SavedQueue = { next: number; entries: QueueEntry[] };

const text = (value: unknown): value is string => typeof value === 'string' && value !== '';
const textOrNull = (value: unknown): value is string | null => value === null || text(value);

function work(stored: unknown): QueuedWork | undefined {
  if (!isRecord(stored)) return undefined;
  if (stored.kind === 'review') return { kind: 'review' };
  if (stored.kind === 'ship') return text(stored.title) ? { kind: 'ship', title: stored.title } : undefined;
  const { project, prompt, card, worktree, folder, as } = stored;
  if (stored.kind !== 'run' || !text(prompt) || !textOrNull(project) || !textOrNull(card) || typeof worktree !== 'boolean' || !textOrNull(folder) || !isPaneKindOrNull(as)) return undefined;
  return { kind: 'run', project, prompt, card, worktree, folder, as };
}

function entry(stored: unknown): QueueEntry[] {
  if (!isRecord(stored)) return [];
  const { id, dispatcherPath, projectPath, cardId, after, queuedAt } = stored;
  const queued = work(stored.work);
  if (!text(id) || !text(dispatcherPath) || !text(projectPath) || !textOrNull(cardId) || !textOrNull(after) || !text(queuedAt) || queued === undefined) return [];
  return [{ id, dispatcherPath, projectPath, cardId, after, queuedAt, work: queued }];
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

// What the pool is built on from main: the file, the live settings, the boards and the start of a ship
// or a review, which card-actions.ts holds. The rest is the session command's (session-requests.ts).
export type PoolPorts = Pick<PaneQueuePorts, 'save' | 'cap' | 'budget' | 'board' | 'now'> & {
  saved: SavedQueue;
  beginCard(entry: QueueEntry): Promise<{ output: string } | Refused>;
};

export function poolPorts(
  userData: string, settings: () => Settings, board: (projectPath: string) => Board | null, beginCard: PoolPorts['beginCard'],
): PoolPorts {
  const file = path.join(userData, PANE_QUEUE_FILE);
  return {
    saved: readQueue(file),
    save(saved) {
      try {
        writeQueue(file, saved);
      } catch {
        // The queue is live in this run; it just will not survive a restart.
      }
    },
    cap: () => settings().workers.cap,
    budget: () => budgetHold(settings().budget, () => budgetVerdict(() => readText(WEEKLY_USAGE_FILE), settings().budget, Date.now())),
    board,
    beginCard,
    now: Date.now,
  };
}
