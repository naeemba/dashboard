import type { WorktreeEntry } from '../../shared/app/bridge';
import { isFinishedColumn, selectionOf, type Board } from '../../shared/board/board';

// Whether the app closes a finished worker pane itself, through pane.release, and why or why not
// (workers-decision-1). Mains were told to release a worker once they had its report, and often did
// not: finished panes piled up until the user closed them by hand.
//
// A pane is closed only once its turn has ended with nothing left running, and then for one of two
// reasons: its card is finished, or it reported, main read the report, and nothing was sent to it
// for the grace period. Never one nobody handed to a main, one with the keyboard (which a zoomed pane
// always has), one waiting on a question, or one paused on its own background work.

// How often the app looks. A card finished closes its worker within this; the grace period after a
// report is minutes, so a half-minute late is nothing. The board is main's copy in memory
// (board-changes.ts), so a look reads nothing from disk once the project's board has been seen.
export const CLOSE_SWEEP_MS = 30 * 1000;

export type WorkerLook = {
  // A main dispatched it, sent it work, or shipped a card into it.
  handedToMain: boolean;
  // The pane its page puts the keyboard back on: the one you are in, or were last.
  hasKeyboard: boolean;
  // What its hooks last said; `running` until they say anything.
  state: 'running' | 'blocked' | 'done';
  // The last stop said background work is still in flight or scheduled.
  paused: boolean;
  // The column its card is in when that is Done or Cancelled, or null. Asked only once nothing before
  // it has kept the pane, since it reads the project's board.
  finishedCard(): string | null;
  // Main read a report from it since work was last sent to it.
  reportRead: boolean;
  // Since the last of: work sent to it, its report read, its turn ended.
  quietMs: number;
};

export type ReleaseVerdict = { release: true; reason: string } | { release: false; why: string };

// `closeAfterMs` is the grace period after a report; 0 closes a pane only for its card.
export function releaseVerdict(look: WorkerLook, closeAfterMs: number): ReleaseVerdict {
  if (!look.handedToMain) return { release: false, why: 'no main handed it work' };
  if (look.hasKeyboard) return { release: false, why: 'it has the keyboard' };
  if (look.state === 'blocked') return { release: false, why: 'it is waiting on a question' };
  if (look.paused) return { release: false, why: 'it is waiting on its own background work' };
  if (look.state === 'running') return { release: false, why: 'it is at work' };
  const card = look.finishedCard();
  if (card !== null) return { release: true, reason: `card ${card.toLowerCase()}` };
  if (closeAfterMs <= 0) return { release: false, why: 'closing on a report is off' };
  if (!look.reportRead) return { release: false, why: 'main has not read a report from it' };
  if (look.quietMs < closeAfterMs) return { release: false, why: 'its grace period is still running' };
  return { release: true, reason: 'reported done' };
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
  const entry = entries.find((each) => each.pane === index && each.projectPath === projectPath);
  return entry === undefined ? null : finishedColumnOf(board(entry.projectPath), entry.cardId);
}
