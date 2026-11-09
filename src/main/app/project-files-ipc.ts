import type { Channels } from './channels';
import type { Board } from '../../shared/board/board';
import type { PullRequestStatus } from '../../shared/board/pull-request-status';
import { openBoard, peekBoard, writeBoard } from '../board/board-store';
import { rebaseBoardChange } from '../../shared/board/board-merge';
import type { BoardChanges } from '../board/board-changes';
import type { BoardSyncQueue } from '../board/board-sync-queue';
import type { BoardWatchers } from '../board/board-watch';
import { readNotes, writeNotes } from '../notes/notes-store';
import { readInk, writeInk } from '../notes/ink-store';

// The two files a project keeps in its .dashboard folder, read and written for the renderer. Main-process
// wiring only, out of main.ts because main had reached its 600-line ceiling; what a board or a page of
// notes is, and how either is read and written, is board-store.ts's and notes-store.ts's. Main hands over
// what only it holds: the watchers that tell the renderer about a write from somewhere else, and the way
// to every screen but one.
export function registerProjectFiles(
  table: Channels, boards: BoardWatchers, changes: BoardChanges, boardSync: BoardSyncQueue,
  tellOthers: (screen: string, channel: string, projectPath: string) => void,
  // The board on screen: its cards are asked about their pull requests (pull-request-sweep.ts).
  shown: (projectPath: string) => void,
  // Each card's pull request glyph, held in main (pull-request-status.ts).
  pullRequests: (projectPath: string, board: Board) => Record<string, PullRequestStatus>,
): void {
  // Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
  // is a convenience — writing the two explanation files — so a read-only project folder must not cost
  // the user a board.json that is sitting right there and perfectly readable.
  table.handle('board:peek', (_screen, projectPath: string) => peekBoard(projectPath));
  table.handle('board:read', (_screen, projectPath: string) => {
    try {
      const read = openBoard(projectPath);
      changes.seen(projectPath, read.board);
      shown(projectPath);
      return { ...read, pullRequests: pullRequests(projectPath, read.board) };
    } finally {
      // After the read, which is what creates .dashboard on a project that has never had a board — and
      // in a finally, because a read that throws still leaves a folder worth watching. Skip it there and
      // that board never notices the command line again for as long as you stay on the screen.
      boards.watch(projectPath);
    }
  });
  // invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
  // The screen sends the board it last read or sent beside its new one, and the change between them
  // is replayed onto the file as it is now, so a card the `board` command moved in the meantime stays
  // moved (board-merge.ts says why). What was written goes back when it holds a change the screen has not
  // seen. The bytes are kept so the watcher can tell this write from somebody else's. Every other screen
  // is told here instead, since to the watcher this write is the app's own: a board left open on the
  // laptop would otherwise never see the cards moved from the mac.
  table.handle('board:write', (screen, projectPath: string, base: Board, board: Board) => {
    const written = rebaseBoardChange(base, board, peekBoard(projectPath));
    changes.wrote(projectPath, written, () => boards.wrote(projectPath, writeBoard(projectPath, written)));
    tellOthers(screen, 'board:change', projectPath);
    // To origin behind the write, never in front of it: the screen does not wait on the network. What
    // the sync brings back from origin reaches the screen through the watcher, as the command's does.
    void boardSync.sync(projectPath);
    // Null when the board went out as sent, so the common save carries nothing back.
    return written === board ? null : written;
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

  // The handwriting page of the same notes, in its own file and with its own channels so a stroke never
  // makes the text box read again, nor a sentence the ink page. Same shape as notes:read and notes:write.
  table.handle('ink:read', (_screen, projectPath: string) => readInk(projectPath));
  table.handle('ink:write', (screen, projectPath: string, text: string) => {
    writeInk(projectPath, text);
    tellOthers(screen, 'ink:change', projectPath);
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
