import { readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { BOARD_DIRECTORY, BOARD_FILE } from './board-store';

// Whether something that happened inside a project's .dashboard folder is a board change the screen
// has to be told about. Two questions, in the order that costs least: the name first, so an event
// about another file is refused before anything is read off the disk.
//
// The folder is watched rather than the file, because writeBoard replaces board.json by renaming a
// temporary file over it and a watch on the file itself follows the old inode into the bin. So the
// events arriving here are for everything in there: board.json.tmp on every single save, CLAUDE.md
// and README.md the first time a project is opened, board.json.broken after a salvage.

// fs.watch does not always say which file it was. Then everything is read and the bytes below are the
// only guard, which is the one that matters anyway.
export function isBoardFile(fileName: string | null): boolean {
  return fileName === null || fileName === BOARD_FILE;
}

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
  // What the app itself last put in that project's board file. Told, not read: the write happens in
  // board-store and only the caller knows the bytes that went out.
  wrote(projectPath: string, text: string): void;
};

// `announce` is called once per change the app did not make. Never a failure anyone sees: a platform
// that refuses the watch, a file that cannot be read — each costs the live redraw and nothing else,
// and the board is still re-read every time you enter it.
export function boardWatchers(announce: (projectPath: string) => void): BoardWatchers {
  const watchers = new Map<string, FSWatcher>();
  const lastWritten = new Map<string, string>();
  return {
    watch: (projectPath) => {
      if (watchers.has(projectPath)) return;
      const directory = path.join(projectPath, BOARD_DIRECTORY);
      let watcher: FSWatcher;
      try {
        watcher = watch(directory, (_event, fileName) => {
          // Before the read, not after: one save fires an event for board.json.tmp and another for the
          // rename, and reading the whole board for the first of them is work on the thread every
          // pane's bytes flow through.
          if (!isBoardFile(fileName)) return;
          let onDisk: string | null;
          try {
            onDisk = readFileSync(path.join(directory, BOARD_FILE), 'utf8');
          } catch {
            onDisk = null;
          }
          if (!isBoardChange(lastWritten.get(projectPath), onDisk)) return;
          // Remembered as if the app had written it, so the several events one save fires announce the
          // change once.
          lastWritten.set(projectPath, onDisk);
          announce(projectPath);
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
    },
    wrote: (projectPath, text) => { lastWritten.set(projectPath, text); },
  };
}
