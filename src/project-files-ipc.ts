import { ipcMain } from 'electron';
import type { Board } from './board';
import { openBoard, peekBoard, writeBoard } from './board-store';
import type { BoardChanges } from './board-changes';
import type { BoardWatchers } from './board-watch';
import { readNotes, writeNotes } from './notes-store';

// The two files a project keeps in its .dashboard folder, read and written for the renderer. Main-process
// wiring only, out of main.ts because main had reached its 600-line ceiling; what a board or a page of
// notes is, and how either is read and written, is board-store.ts's and notes-store.ts's. Main hands over
// the one thing only it holds, the watchers that tell the renderer about a write from somewhere else.
export function registerProjectFiles(boards: BoardWatchers, changes: BoardChanges): void {
  // Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
  // is a convenience — writing the two explanation files — so a read-only project folder must not cost
  // the user a board.json that is sitting right there and perfectly readable.
  ipcMain.handle('board:peek', (_event, projectPath: string) => peekBoard(projectPath));
  ipcMain.handle('board:read', (_event, projectPath: string) => {
    try {
      const read = openBoard(projectPath);
      changes.seen(projectPath, read.board);
      return read;
    } finally {
      // After the read, which is what creates .dashboard on a project that has never had a board — and
      // in a finally, because a read that throws still leaves a folder worth watching. Skip it there and
      // that board never notices the command line again for as long as you stay on the screen.
      boards.watch(projectPath);
    }
  });
  // invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
  // The bytes are kept so the watcher can tell this write from somebody else's. Nothing is returned to
  // the renderer: it already has the board it just sent.
  ipcMain.handle('board:write', (_event, projectPath: string, board: Board) => {
    changes.wrote(projectPath, board, () => boards.wrote(projectPath, writeBoard(projectPath, board)));
  });

  // The project's page of notes. No watcher and no seeding: the notes are one box one person types
  // into, and a project that has never had any has no file until the first keystroke lands.
  ipcMain.handle('notes:read', (_event, projectPath: string) => readNotes(projectPath));
  // invoke, not send, for the same reason board:write is: a write that fails rejects in the renderer
  // and reaches the status bar, rather than leaving a page on screen that is not on disk.
  ipcMain.handle('notes:write', (_event, projectPath: string, text: string) => {
    writeNotes(projectPath, text);
  });
}

// Watched from the open, not only from the first board read: a `board move` an agent runs before anyone
// presses Ctrl+B would otherwise reach no watcher and never be logged. The board on disk is the one the
// first change is compared with. A project with no .dashboard yet refuses the watch, and board:read
// starts it once the folder exists.
export function watchProjectBoard(boards: BoardWatchers, changes: BoardChanges, projectPath: string): void {
  const board = peekBoard(projectPath);
  if (board) changes.seen(projectPath, board);
  boards.watch(projectPath);
}
