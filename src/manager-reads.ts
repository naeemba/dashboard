import type { Board } from './board';
import type { BoardRead } from './board-store';

// What the manager's list reads for itself, on top of the rows the renderer hands it: every open
// project's board, for the counts and the activity, and which worktrees have uncommitted changes.
// Both are read in the background and the list redraws when an answer lands, so opening the manager
// never waits on a disk or on git.
//
// Kept fresh by asking again once an answer is old, rather than by listening for every way it could
// change. A board edited on the board screen is written by the app itself, which main does not report
// back, so an answer this old is the only thing that would ever notice it.

// A board read this long ago is read again the next time the list is drawn. Short, because a card you
// moved on the board screen should have moved here by the time you arrive.
export const BOARD_STALE_MS = 5_000;
// Longer, because this one is a `git status` per worktree rather than a file read.
export const DIRTY_STALE_MS = 15_000;

// Whether an answer is due to be asked for again. Never read counts as due.
export function isStale(readAt: number | undefined, now: number, maxAge: number): boolean {
  return readAt === undefined || now - readAt >= maxAge;
}

export type ManagerReadsPorts = {
  readBoard(projectPath: string): Promise<BoardRead>;
  dirtyWorktrees(): Promise<{ dirty: string[]; unreadable: string[] }>;
  // An answer landed; the list should be drawn again.
  onRead(): void;
  now(): number;
};

export type Dirtiness = { checked: boolean; dirty: ReadonlySet<string>; unreadable: ReadonlySet<string> };

export type ManagerReads = {
  // The last board read for this project, or undefined before the first read has landed.
  boardOf(projectPath: string): Board | undefined;
  dirtiness(): Dirtiness;
  // Asks again for whatever is missing or old. Called on every draw, so it has to be cheap when
  // nothing is due. A project not in `projectPaths` has closed, and its board is dropped.
  refresh(projectPaths: readonly string[], worktreePaths: readonly string[]): void;
  // Something outside the app wrote this project's board: read it now, however fresh the last read.
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
  let dirtiness: Dirtiness = { checked: false, dirty: new Set(), unreadable: new Set() };
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
    ports.readBoard(projectPath)
      .then((read) => {
        // A file that would not parse comes back as an empty board. Counting that would say the
        // project has nothing in flight, so the last good read is kept instead. The board screen
        // is where the broken file is reported.
        if (read.brokenFile === null) boards.set(projectPath, read.board);
      })
      // A read that failed keeps the last answer. The board screen says why when you go there.
      .catch(() => {})
      .finally(() => {
        reading.delete(projectPath);
        readAt.set(projectPath, ports.now());
        if (readAgain.delete(projectPath)) readBoard(projectPath);
        ports.onRead();
      });
  }

  function checkDirtiness(worktreePaths: readonly string[]): void {
    checking = true;
    const about = worktreePaths.join('\n');
    ports.dirtyWorktrees()
      .then((result) => {
        dirtiness = { checked: true, dirty: new Set(result.dirty), unreadable: new Set(result.unreadable) };
      })
      // A check that failed says nothing is known, rather than keeping an answer about worktrees that
      // may since have changed. Each row then reads `…` until the next check.
      .catch(() => {
        dirtiness = { checked: false, dirty: new Set(), unreadable: new Set() };
      })
      .finally(() => {
        checking = false;
        dirtyAt = ports.now();
        dirtyAbout = about;
        ports.onRead();
      });
  }

  return {
    boardOf: (projectPath) => boards.get(projectPath),
    dirtiness: () => dirtiness,
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
      if (sorted.join('\n') !== dirtyAbout || isStale(dirtyAt, now, DIRTY_STALE_MS)) checkDirtiness(sorted);
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
