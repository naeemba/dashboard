import { failureText } from '../../shared/errors/failure';
import { notSyncedWarning } from './board-sync';
import type { BoardSync } from './board-sync-git';

// The app's door into the board's git sync. Every board write in the app (a save from the screen,
// card.move, the review sweep's) asks for one after it has written the file, and the screen never waits
// on the network: the write is on disk at once and goes to origin behind it.
//
// One sync per project at a time, since two would race each other's push and fast-forward. Asks that
// arrive while one runs share the one queued behind it — a burst of thirty saves is two syncs, not
// thirty — and every ask's promise settles only once a sync that started after it has finished, so a
// caller that waits (card.move before a ship cuts its branch) waits for its own write to be on origin.
//
// A project whose sync cannot reach origin is warned about once, not on every save while the train is
// in the tunnel, and again only after a sync has gone through. A sync that throws is the same warning.

export type BoardSyncQueue = { sync(projectPath: string): Promise<void> };

export function boardSyncQueue(
  syncBoard: (projectPath: string) => Promise<BoardSync>,
  warn: (projectPath: string, message: string) => void,
): BoardSyncQueue {
  const last = new Map<string, Promise<void>>();
  const queued = new Map<string, Promise<void>>();
  const warned = new Set<string>();

  async function once(projectPath: string): Promise<void> {
    queued.delete(projectPath);
    let outcome: BoardSync;
    try {
      outcome = await syncBoard(projectPath);
    } catch (error: unknown) {
      outcome = { synced: false, warning: notSyncedWarning(failureText(error)) };
    }
    if (outcome.synced) warned.delete(projectPath);
    else if (outcome.warning !== null && !warned.has(projectPath)) {
      warned.add(projectPath);
      warn(projectPath, outcome.warning);
    }
  }

  return {
    sync(projectPath) {
      const waiting = queued.get(projectPath);
      if (waiting) return waiting;
      const next = (last.get(projectPath) ?? Promise.resolve()).then(() => once(projectPath));
      queued.set(projectPath, next);
      last.set(projectPath, next);
      return next;
    },
  };
}
