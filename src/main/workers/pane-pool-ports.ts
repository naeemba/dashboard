import path from 'node:path';
import type { Refused } from '../../shared/app/bridge';
import type { Settings } from '../../shared/settings/settings';
import type { PaneQueuePorts, PaneStartInput } from '../actions/pane/queue';
import { readText } from '../app/missing-file';
import { peekBoard } from '../board/board-store';
import { budgetVerdict } from '../command/budget-cli';
import { WEEKLY_USAGE_FILE } from '../usage/weekly-usage-file';
import { processAlive } from '../app/process-alive';
import { budgetHold, type CardWork, type QueueEntry } from './pane-pool';
import { PANE_QUEUE_FILE, readQueue, writeQueue, type SavedQueue } from './pane-queue-store';

// What the pane pool is built on from main: its file, the live settings and the budget reading, the
// boards, and the start of a ship or a review, which card-actions.ts holds. The rest is the session
// command's (session-requests.ts).

export type PoolPorts = Pick<PaneQueuePorts, 'save' | 'cap' | 'budget' | 'board' | 'drainBoard' | 'now' | 'move' | 'gone' | 'alive'> & {
  saved: SavedQueue;
  beginCard(entry: QueueEntry, work: CardWork): Promise<{ output: string } | Refused>;
};

// A ship's or a review's start as card-actions.ts asks for it. `askedFrom` is the folder the `board`
// command ran in, whose page's main the start is told to, the manager's included; null for a start no
// command asked for (the screen, the sweeps), which the card's project's main is told.
export type CardStart = Omit<PaneStartInput, 'dispatcherPath'> & { askedFrom: string | null };

// What card-actions.ts gives the pool: a card's start, card.move for a withdrawn card, and the review
// sweep told of a review that will not start.
export type CardPool = Pick<PoolPorts, 'beginCard' | 'move' | 'gone'>;

// `changed` is told after every save, for the workers popup to read the queue again.
export function poolPorts(userData: string, settings: () => Settings, cards: CardPool, changed: () => void): PoolPorts {
  const file = path.join(userData, PANE_QUEUE_FILE);
  return {
    saved: readQueue(file),
    save(saved) {
      try {
        writeQueue(file, saved);
      } catch {
        // The queue is live in this run; it just will not survive a restart.
      }
      changed();
    },
    cap: () => ({ project: settings().workers.cap, total: settings().workers.totalCap }),
    budget: () => budgetHold(settings().budget, () => budgetVerdict(() => readText(WEEKLY_USAGE_FILE), settings().budget, Date.now())),
    // Off the disk, not the move log's last read: a `board move` into Ship is written plainly and read
    // back by the watcher later, and the drain right after it would see the card where it was before.
    // ponytail: a board read per project per drain while card entries are queued; keep the move log's copy fresh if that shows.
    board: peekBoard,
    drainBoard: (projectPath) => peekBoard(projectPath, true),
    ...cards,
    now: Date.now,
    alive: processAlive,
  };
}
