import type { Board } from './board';
import type { ScannedWorktree } from './git-worktrees';
import { isStale } from './stale';

// What the manager's list reads for itself, on top of the rows the renderer hands it: every open
// project's board, for the counts and the activity, and every worktree git knows of in those projects —
// which have uncommitted changes, and how big each is.
// Both are read in the background and the list redraws when an answer lands, so opening the manager
// never waits on a disk or on git.
//
// Kept fresh two ways: refresh asks again for whatever answer has gone old, and boardChanged reads a
// board at once when told it was written.

// A board read this long ago is read again the next time the list is drawn. Short, because a card you
// moved on the board screen should have moved here by the time you arrive.
export const BOARD_STALE_MS = 5_000;
// Longer, because this one is a `git worktree list` per project and a `git status` per worktree rather
// than a file read.
export const DIRTY_STALE_MS = 15_000;


export type ManagerReadsPorts = {
  // Null when there is nothing to count; board-store.ts's peekBoard says when.
  peekBoard(projectPath: string): Promise<Board | null>;
  scanWorktrees(projectPaths: string[]): Promise<ScannedWorktree[]>;
  // An answer landed; the list should be drawn again.
  onRead(): void;
  now(): number;
};

export type Dirtiness = { checked: boolean; dirty: ReadonlySet<string>; unreadable: ReadonlySet<string> };

// Before the first check has come back, and after one that failed.
const UNKNOWN: Dirtiness = { checked: false, dirty: new Set(), unreadable: new Set() };

function sameSet(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  return first.size === second.size && [...first].every((path) => second.has(path));
}

// Whether two answers would draw the same list. A check that turns a known answer into unknown is a
// change: every row goes back to `…`.
export function sameDirtiness(first: Dirtiness, second: Dirtiness): boolean {
  return first.checked === second.checked
    && sameSet(first.dirty, second.dirty)
    && sameSet(first.unreadable, second.unreadable);
}

export type ManagerReads = {
  // The last board read for this project, or undefined before the first read has landed.
  boardOf(projectPath: string): Board | undefined;
  dirtiness(): Dirtiness;
  // Every worktree the last scan found in this project, recorded or not; empty before the first.
  worktreesOf(projectPath: string): readonly ScannedWorktree[];
  // Asks again for whatever is missing or old, and does nothing when nothing is due, so it is cheap
  // to call often. A project not in `projectPaths` has closed, and its board is dropped.
  // `worktreePaths` are the recorded ones: a new one makes the scan old at once, and one the scan did
  // not find is one git could not answer for.
  refresh(projectPaths: readonly string[], worktreePaths: readonly string[]): void;
  // Something wrote this project's board — the app or anything outside it: read it now, however
  // fresh the last read.
  boardChanged(projectPath: string): void;
  // A worktree was removed from here: check the rest again on the next draw.
  forgetDirtiness(): void;
};

export function createManagerReads(ports: ManagerReadsPorts): ManagerReads {
  const boards = new Map<string, Board>();
  const readAt = new Map<string, number>();
  const reading = new Set<string>();
  // A change reported while a read of the same board was already running. That read may have got the
  // file from before the change, so one more is started when it lands.
  const readAgain = new Set<string>();
  let dirtiness = UNKNOWN;
  let scanned: ScannedWorktree[] = [];
  let dirtyAt: number | undefined;
  // Which worktrees the last check was about. A new one appearing makes the answer old at once: it
  // would otherwise read `…` for up to fifteen seconds.
  let dirtyAbout = '';
  let checking = false;

  function readBoard(projectPath: string): void {
    if (reading.has(projectPath)) {
      readAgain.add(projectPath);
      return;
    }
    reading.add(projectPath);
    // Whether the answer is worth a redraw. Most reads find the board as it was, and a redraw for
    // each of those would rebuild the whole list once per project every few seconds.
    let changed = false;
    ports.peekBoard(projectPath)
      .then((board) => {
        // Nothing to count keeps the last good answer rather than drawing the project as empty. The
        // board screen is where a broken or unreadable file is reported.
        if (board === null) return;
        changed = JSON.stringify(board) !== JSON.stringify(boards.get(projectPath));
        boards.set(projectPath, board);
      })
      .catch(() => {})
      .finally(() => {
        reading.delete(projectPath);
        readAt.set(projectPath, ports.now());
        if (readAgain.delete(projectPath)) readBoard(projectPath);
        if (changed) ports.onRead();
      });
  }

  function checkDirtiness(projectPaths: readonly string[], worktreePaths: readonly string[], about: string): void {
    checking = true;
    const before = dirtiness;
    const beforeScan = JSON.stringify(scanned);
    ports.scanWorktrees([...projectPaths])
      .then((result) => {
        scanned = result;
        const found = new Set(result.map((worktree) => worktree.worktreePath));
        dirtiness = {
          checked: true,
          dirty: new Set(result.filter((worktree) => worktree.dirty).map((worktree) => worktree.worktreePath)),
          unreadable: new Set([
            ...result.filter((worktree) => worktree.unreadable).map((worktree) => worktree.worktreePath),
            ...worktreePaths.filter((path) => !found.has(path)),
          ]),
        };
      })
      // A check that failed says nothing is known, rather than keeping an answer about worktrees that
      // may since have changed. Each row then reads `…` until the next check.
      .catch(() => {
        scanned = [];
        dirtiness = UNKNOWN;
      })
      .finally(() => {
        checking = false;
        dirtyAt = ports.now();
        dirtyAbout = about;
        // The same answer again redraws nothing, as a board read that finds nothing new does not.
        if (!sameDirtiness(before, dirtiness) || JSON.stringify(scanned) !== beforeScan) ports.onRead();
      });
  }

  return {
    boardOf: (projectPath) => boards.get(projectPath),
    dirtiness: () => dirtiness,
    worktreesOf: (projectPath) => scanned.filter((worktree) => worktree.projectPath === projectPath),
    refresh(projectPaths, worktreePaths) {
      for (const path of [...boards.keys()]) {
        if (projectPaths.includes(path)) continue;
        boards.delete(path);
        readAt.delete(path);
      }
      const now = ports.now();
      for (const path of projectPaths) {
        if (!reading.has(path) && isStale(readAt.get(path), now, BOARD_STALE_MS)) readBoard(path);
      }
      if (checking) return;
      const sorted = [...worktreePaths].sort();
      const about = [...projectPaths, ...sorted].join('\n');
      if (about !== dirtyAbout || isStale(dirtyAt, now, DIRTY_STALE_MS)) checkDirtiness(projectPaths, sorted, about);
    },
    // Only a project already being read: a change to the board of one that is not open, or of the
    // manager's own, has no row here to draw.
    boardChanged(projectPath) {
      if (readAt.has(projectPath) || reading.has(projectPath)) readBoard(projectPath);
    },
    forgetDirtiness() {
      dirtyAt = undefined;
    },
  };
}
