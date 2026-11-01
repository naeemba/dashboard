import type { Board } from '../../shared/board/board';
import { cardMoves } from './card-moves';
import type { LogDraft } from '../../shared/app/log-entry';

// Card moves, for the log. The last board each project was read or written with is kept here, and each
// new one is compared with it: a write from the app is a `card` entry, a change from the `board`
// command is a `board` one. `peek` is board-store's, handed in so this is tested without a folder.
export type BoardChanges = {
  seen(projectPath: string, board: Board): void;
  wrote(projectPath: string, board: Board, write: () => void): void;
  changed(projectPath: string): void;
};

export function boardChanges(log: (draft: LogDraft) => void, peek: (projectPath: string) => Board | null): BoardChanges {
  const last = new Map<string, Board>();

  // `prefix` says who moved it: nothing for the app, `board command moved ` for the command.
  function record(projectPath: string, before: Board | undefined, after: Board, kind: 'card' | 'board', prefix: string): void {
    last.set(projectPath, after);
    if (!before) return;
    for (const move of cardMoves(before, after)) log({ level: 'info', kind, project: projectPath, message: `${prefix}${move}` });
  }

  return {
    seen: (projectPath, board) => { last.set(projectPath, board); },
    // The board before is found ahead of the write, so one the app never read — the manager writes every
    // open project's — is compared with what is still on disk. The moves are recorded only after the
    // write returns: a read-only project throws there, and logging first would put a move in the log
    // that never reached the file, and leave that unwritten board as the one the next write is read
    // against.
    wrote: (projectPath, board, write) => {
      const before = last.get(projectPath) ?? peek(projectPath) ?? undefined;
      write();
      record(projectPath, before, board, 'card', '');
    },
    changed: (projectPath) => {
      const board = peek(projectPath);
      if (board) record(projectPath, last.get(projectPath), board, 'board', 'board command moved ');
    },
  };
}
