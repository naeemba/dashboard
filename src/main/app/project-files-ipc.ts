import type { Channels } from './channels';
import type { Board } from '../../shared/board/board';
import { openBoard, peekBoard, writeBoard } from '../board/board-store';
import { rebaseBoardChange } from '../../shared/board/board-merge';
import type { BoardChanges } from '../board/board-changes';
import type { BoardWatchers } from '../board/board-watch';
import { readNotes, writeNotes } from '../notes/notes-store';

// The two files a project keeps in its .dashboard folder, read and written for the renderer. Main-process
// wiring only, out of main.ts because main had reached its 600-line ceiling; what a board or a page of
// notes is, and how either is read and written, is board-store.ts's and notes-store.ts's. Main hands over
// what only it holds: the watchers that tell the renderer about a write from somewhere else, and the way
// to every screen but one.
export function registerProjectFiles(
  table: Channels, boards: BoardWatchers, changes: BoardChanges,
  tellOthers: (screen: string, channel: string, projectPath: string) => void,
): void {
  // Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
  // is a convenience — writing the two explanation files — so a read-only project folder must not cost
  // the user a board.json that is sitting right there and perfectly readable.
  table.handle('board:peek', (_screen, projectPath: string) => peekBoard(projectPath));
  table.handle('board:read', (_screen, projectPath: string) => {
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
  // The screen sends the board it last read or wrote beside its new one, and the change between them
  // is replayed onto the file as it is now, so a card the `board` command moved in the meantime stays
  // moved: rebaseBoardChange says what that costs otherwise. What was written goes back, since it can
  // hold a move the screen has not seen yet. The bytes are kept so the watcher can tell this write from
  // somebody else's. Every other screen is told here instead, since to the watcher this write is the
  // app's own: a board left open on the laptop would otherwise never see the cards moved from the mac.
  table.handle('board:write', (screen, projectPath: string, base: Board, board: Board) => {
    // A file that is gone or will not parse has nothing to keep, and the screen's board is written as
    // it is; replaying onto an empty one would drop every card the screen did not touch.
    const onDisk = peekBoard(projectPath);
    const written = onDisk === null ? board : rebaseBoardChange(base, board, onDisk);
    changes.wrote(projectPath, written, () => boards.wrote(projectPath, writeBoard(projectPath, written)));
    tellOthers(screen, 'board:change', projectPath);
    return written;
  });

  // The project's page of notes. No watcher and no seeding: a project that has never had any has no
  // file until the first keystroke lands. A write from one screen is told to the others, for the same
  // reason a board's is.
  table.handle('notes:read', (_screen, projectPath: string) => readNotes(projectPath));
  // invoke, not send, for the same reason board:write is: a write that fails rejects in the renderer
  // and reaches the status bar, rather than leaving a page on screen that is not on disk.
  table.handle('notes:write', (screen, projectPath: string, text: string) => {
    writeNotes(projectPath, text);
    tellOthers(screen, 'notes:change', projectPath);
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
