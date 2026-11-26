import type { WorktreeEntry } from '../../shared/app/bridge';
import { entryForPane } from '../ship/worktree-store';
import { isFinishedColumn, selectionOf, type Board } from '../../shared/board/board';

// Whether a worker pane may close now that main's own command put its work in: `pr land` merged the
// branch of the worktree it works in, or a board move put its card in Done or Cancelled
// (workers-decision-1). Nothing closes a pane on a timer: a sweep that did closed a pane the user was
// still reading, and kept three paused review workers open with their cards Done.
//
// Never one nobody handed to a main, one with the keyboard (which a zoomed pane always has), one waiting
// on a question, one you typed into since main last sent it work (that turn is yours), or one mid-turn.
// One paused on its own background work (a wakeup, a CI wait) does close: its work is in, so what it
// waits on is moot.

export type WorkerLook = {
  // A main dispatched it, sent it work, or shipped a card into it.
  handedToMain: boolean;
  // The pane its page puts the keyboard back on: the one you are in, or were last.
  hasKeyboard: boolean;
  // What its hooks last said; `running` until they say anything.
  state: 'running' | 'blocked' | 'done';
  // The last prompt typed into it was yours, not main's (prompt-source.ts).
  typedByUser: boolean;
};

export type ReleaseVerdict = { release: true } | { release: false; why: string };

export function releaseVerdict(look: WorkerLook): ReleaseVerdict {
  if (!look.handedToMain) return { release: false, why: 'no main handed it work' };
  if (look.hasKeyboard) return { release: false, why: 'it has the keyboard' };
  if (look.state === 'blocked') return { release: false, why: 'it is waiting on a question' };
  if (look.typedByUser) return { release: false, why: 'you typed into it since main last sent it work' };
  if (look.state === 'running') return { release: false, why: 'it is mid-turn' };
  return { release: true };
}

// The column a card is in when it is finished (isFinishedColumn), or null: not finished, not on the
// board, or no board to read.
export function finishedColumnOf(board: Board | null, cardId: string): string | null {
  const at = board === null ? null : selectionOf(board, cardId);
  return board !== null && at !== null && isFinishedColumn(board, at.column) ? board.columns[at.column].name : null;
}

// The finished column of the card whose worktree's record names this pane of the project, read off the
// project's own board: the one a merge moves the card to Done on.
export function finishedCardIn(
  entries: readonly WorktreeEntry[], projectPath: string | undefined, index: number, board: (projectPath: string) => Board | null,
): string | null {
  const entry = entryForPane(entries, projectPath, index);
  return entry === undefined ? null : finishedColumnOf(board(entry.projectPath), entry.cardId);
}
