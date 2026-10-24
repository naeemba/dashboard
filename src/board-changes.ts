import type { Board } from './board';
import { cardMoves } from './card-moves';
import type { LogDraft } from './log-entry';

// Card moves, for the log. The last board each project was read or written with is kept here, and each
// new one is compared with it: a write from the app is a `card` entry, a change from the `board`
// command is a `board` one. `peek` is board-store's, handed in so this is tested without a folder.
export type BoardChanges = {
  seen(projectPath: string, board: Board): void;
  wrote(projectPath: string, board: Board): void;
  changed(projectPath: string): void;
};

export function boardChanges(log: (draft: LogDraft) => void, peek: (projectPath: string) => Board | null): BoardChanges {
  const last = new Map<string, Board>();

  function record(projectPath: string, before: Board | undefined | null, after: Board, fromCommand: boolean): void {
    last.set(projectPath, after);
    if (!before) return;
    for (const move of cardMoves(before, after)) {
      log({
        level: 'info', kind: fromCommand ? 'board' : 'card', project: projectPath,
        message: fromCommand ? `board command moved ${move}` : move,
      });
    }
  }

  return {
    seen: (projectPath, board) => { last.set(projectPath, board); },
    // Called before the write lands, so a board the app never read — the manager writes every open
    // project's — is compared with what is still on disk.
    wrote: (projectPath, board) => record(projectPath, last.get(projectPath) ?? peek(projectPath), board, false),
    changed: (projectPath) => {
      const board = peek(projectPath);
      if (board) record(projectPath, last.get(projectPath), board, true);
    },
  };
}
