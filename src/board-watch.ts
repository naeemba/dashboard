import { BOARD_FILE } from './board-store';

// Whether something that happened inside a project's .dashboard folder is a board change the screen
// has to be told about.
//
// The folder is watched rather than the file, because writeBoard replaces board.json by renaming a
// temporary file over it and a watch on the file itself follows the old inode into the bin. So the
// events arriving here are for everything in there: board.json.tmp on every single save, CLAUDE.md
// and README.md the first time a project is opened, board.json.broken after a salvage.
//
// `lastWritten` is the bytes the app itself last put in the file. Without that comparison the app is
// its own loudest writer — every keystroke on the board saves, the watcher fires, and the board
// would be re-read and redrawn underneath the selection thirty times a minute.
export function isBoardChange(
  fileName: string | null,
  lastWritten: string | undefined,
  onDisk: string | null,
): boolean {
  // fs.watch does not always say which file it was. Then the comparison below is the only guard, and
  // it is the one that matters: a change to CLAUDE.md leaves board.json's bytes exactly as they were.
  if (fileName !== null && fileName !== BOARD_FILE) return false;
  // Unreadable or gone. Nothing to show, and telling the renderer would have it read the same
  // missing file and replace the cards on screen with an empty board.
  if (onDisk === null) return false;
  return onDisk !== lastWritten;
}
