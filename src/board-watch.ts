import { BOARD_FILE } from './board-store';

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
