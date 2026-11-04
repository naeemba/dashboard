import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { BOARD_FILE, boardPath, boardSnapshot } from './board-store';
import { BOARD_FOLDER } from './board-files';

// Whether something that happened inside a project's .dashboard folder is a board change the screen
// has to be told about. Two questions, in the order that costs least: the name first, so an event
// about another file is refused before anything is read off the disk.
//
// The .dashboard folder is watched rather than any one file, and watched with everything under it: the
// board is a folder of card files now, each replaced by renaming a temporary file over it, and the
// board.json of a project not yet moved into that folder is still read. So the events arriving here
// are for everything in there: a <name>.<pid>.<uuid>.tmp on every file a save writes, CLAUDE.md and
// README.md the first time a project is opened, notes.md as you type, a `.broken` file after a salvage.
// `fileName` is relative to .dashboard, with the platform's separator.

// fs.watch does not always say which file it was. Then everything is read and the bytes below are the
// only guard, which is the one that matters anyway.
export function isBoardFile(fileName: string | null): boolean {
  if (fileName === null) return true;
  const name = fileName.split(path.sep).join('/');
  if (name.endsWith('.tmp')) return false;
  return name === BOARD_FILE || name === BOARD_FOLDER || name.startsWith(`${BOARD_FOLDER}/`);
}

// How long a burst of events waits before the board is read. One save of a moved card is a few
// events; the first write of a board still in board.json is one per card, a hundred and seventy on
// this repo's own, and each would otherwise read every card file again and redraw the screen.
const SETTLE_MS = 30;

// `lastWritten` is the bytes the app itself last put in the file. Without this comparison the app is
// its own loudest writer — every keystroke on the board saves, the watcher fires, and the board would
// be re-read and redrawn underneath the selection thirty times a minute.
//
// A null `onDisk` is a file that is gone or unreadable. Nothing to show, and telling the renderer
// would have it read the same missing file and replace the cards on screen with an empty board.
export function isBoardChange(lastWritten: string | undefined, onDisk: string | null): onDisk is string {
  return onDisk !== null && onDisk !== lastWritten;
}

// The watchers themselves, which were main.ts's until that file reached its ceiling. They belong here:
// this file is named for watching boards, and it already held the two questions the watcher asks.
// What main keeps is the one thing only it can do — tell the renderer.
export type BoardWatchers = {
  // Start watching a project's folder. Idempotent, and called from the board read, which is the only
  // way a board reaches the screen and the thing that creates the folder on a project that has never
  // had one.
  watch(projectPath: string): void;
  // The project is closed. Its watcher goes and so does the record of what the app last wrote there.
  forget(projectPath: string): void;
  // The snapshot of what the app itself last put in that project's board. Told, not read: the write happens in
  // board-store and only the caller knows the bytes that went out.
  wrote(projectPath: string, text: string): void;
};

// `announce` is called once per change the app did not make. Never a failure anyone sees: a platform
// that refuses the watch, a file that cannot be read — each costs the live redraw and nothing else,
// and the board is still re-read every time you enter it.
export function boardWatchers(announce: (projectPath: string) => void): BoardWatchers {
  const watchers = new Map<string, FSWatcher>();
  const lastWritten = new Map<string, string>();
  const settling = new Map<string, NodeJS.Timeout>();

  function readAndAnnounce(projectPath: string): void {
    settling.delete(projectPath);
    let onDisk: string | null;
    try {
      onDisk = boardSnapshot(projectPath);
    } catch {
      onDisk = null;
    }
    if (!isBoardChange(lastWritten.get(projectPath), onDisk)) return;
    // Remembered as if the app had written it, so the several events one save fires announce the
    // change once.
    lastWritten.set(projectPath, onDisk);
    announce(projectPath);
  }

  return {
    watch: (projectPath) => {
      if (watchers.has(projectPath)) return;
      // The folder boardPath puts the board in, so the manager's is watched in the home directory.
      const directory = path.dirname(boardPath(projectPath));
      let watcher: FSWatcher;
      try {
        watcher = watch(directory, { recursive: true }, (_event, fileName) => {
          // Before the read, not after: every file a save writes fires an event for its temporary
          // file and another for the rename, and reading the whole board for the first of them is
          // work on the thread every pane's bytes flow through.
          if (!isBoardFile(fileName) || settling.has(projectPath)) return;
          settling.set(projectPath, setTimeout(() => readAndAnnounce(projectPath), SETTLE_MS));
        });
      } catch {
        return;
      }
      watchers.set(projectPath, watcher);
    },
    forget: (projectPath) => {
      watchers.get(projectPath)?.close();
      watchers.delete(projectPath);
      lastWritten.delete(projectPath);
      clearTimeout(settling.get(projectPath));
      settling.delete(projectPath);
    },
    wrote: (projectPath, text) => { lastWritten.set(projectPath, text); },
  };
}
