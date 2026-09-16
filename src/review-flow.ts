import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_FILE_PATH, parseBoard, readBoard, writeBoard } from './board-store';
import { intoReview, reviewPrompt, reviewRefused } from './review';
import { uncommittedCount } from './ship';
import { cardById, type Board } from './board';
import type { ShipResult, WorktreeRemoval } from './bridge';
import type { WorktreeEntry } from './worktree-store';

// The second half of a ship, in the order it happens. An agent that has put a pull request number on
// its card is finished, so the card lands in Review, the worktree the work was written in is thrown
// away, and a fresh one is cut from the same branch in the same folder with an agent reviewing the
// pull request rather than writing it.
//
// Its own file rather than another sixty lines of main.ts, which was already within sight of the size
// this project holds a file to. What is left there is the handful of questions only main can answer:
// which worktrees exist, which page a project is open on, which panes are free, and the git and pane
// steps themselves — every one of which is a step a ship already takes.

export type ReviewPorts = {
  // Every worktree the app has made, read fresh each tick: a ship or a removal between two ticks
  // changes it, and a list captured once would go on offering a card whose folder has gone.
  worktrees: () => readonly WorktreeEntry[];
  // The page a project is open on, or -1 when it is not open at all.
  slotOf: (projectPath: string) => number;
  // A pane of that page nobody is using, or null when all five are taken. `freeing` is a pane about to
  // be handed back — the one the card's own worktree is holding — counted as free, so the answer asked
  // before anything is destroyed is the answer the pane is given after.
  freePaneIn: (slot: number, freeing: number | null) => number | null;
  removeWorktree: (worktreePath: string, force: boolean) => Promise<WorktreeRemoval>;
  // Check the branch out again at the same path. No new branch and no base: the branch is already
  // there with the pull request on it, and everything the agent pushed is on it already.
  addWorktree: (entry: WorktreeEntry) => Promise<unknown>;
  // Record the worktree and start the agent on it, answering the way a ship does — with the record it
  // wrote, or with the message saying which step refused.
  startReview: (entry: WorktreeEntry, slot: number, prompt: string) => ShipResult;
  // Run this with the project's git queue held — the same queue the ships use, so a review and a ship
  // of two different cards in one repository cannot land on git's index lock together.
  queue: <T>(key: string, run: () => Promise<T>) => Promise<T>;
};

// The pull request on a worktree's own board, or null when the agent has not opened one yet. That
// number is the whole signal: an agent that has opened a pull request has done the work, whatever
// column it left the card in and whatever it said about it, and one that never gets that far never
// writes the field — so a card that failed is left alone rather than reviewed. The worktree's own
// board is where to look, because it is the copy the agent has been editing all along.
//
// parseBoard rather than readBoard: readBoard moves a board.json it cannot parse aside, and in a
// worktree that file is tracked and committed. A sweep running on a timer must not delete a branch's
// board because the agent in it wrote a broken one.
function finishedIn(entry: WorktreeEntry): number | null {
  try {
    const text = readFileSync(join(entry.worktreePath, BOARD_FILE_PATH), 'utf8');
    return cardById(parseBoard(text), entry.cardId)?.pullRequest ?? null;
  } catch {
    return null;
  }
}

// The app's own move on a project's board. Deliberately not remembered the way board:write is: the
// screen has not heard of this change, so main's watcher has to read it back as somebody else's write
// and redraw — the same path a card moved from the `board` command takes.
function editProjectBoard(projectPath: string, edit: (board: Board) => Board | null): void {
  try {
    const next = edit(readBoard(projectPath).board);
    // Null is the edit having nothing to do. The file's bytes and its mtime are left alone, so no
    // board is redrawn for a move that did not happen.
    if (next) writeBoard(projectPath, next);
  } catch {
    // A board that cannot be read or written. The review itself is unaffected, and the worktree list
    // still says where this card's work went.
  }
}

// What went wrong, or an empty string when nothing did.
async function swapWorktree(
  ports: ReviewPorts,
  entry: WorktreeEntry,
  pullRequest: number,
  slot: number,
): Promise<string> {
  // Not forced. What is uncommitted in a worktree exists nowhere else, and an agent that left
  // something behind is exactly the case worth stopping for — the card still lands in Review, and the
  // line on it names the branch to go and look at.
  const removed = await ports.removeWorktree(entry.worktreePath, false);
  if (!removed.ok) {
    return removed.dirty.length === 0 ? removed.message : `${uncommittedCount(removed.dirty)} in ${entry.branch}`;
  }
  await ports.addWorktree(entry);
  const started = ports.startReview(
    { ...entry, pane: null, reviewing: true },
    slot,
    reviewPrompt(entry.cardId, pullRequest, entry.projectPath),
  );
  return started.ok ? '' : started.message;
}

export type ReviewSweep = {
  // Every worktree the app made, asked whether the agent in it has opened a pull request yet. One
  // small file read and parsed per in-flight worktree per call — there is no watcher, because the
  // folder to watch is one nothing on screen is looking at and it comes and goes with the card.
  run: () => Promise<void>;
  // This card is being shipped again, so whatever its last review was is over.
  forget: (cardId: string) => void;
};

export function reviewSweep(ports: ReviewPorts): ReviewSweep {
  // Cards a review has already been started for, or tried for and refused. Kept for the run rather
  // than on the record, because the record only changes when the swap works: one that stopped at a
  // dirty worktree leaves the old entry exactly as it was, and without this the sweep would find the
  // same finished card on the next tick and spawn git at it again for as long as the app is open.
  const reviewed = new Set<string>();

  // One card, start to finish. Every guard in it is synchronous and runs before the first await —
  // including the mark — so the whole list can be walked at once without two of them starting the
  // same card.
  async function reviewOne(entry: WorktreeEntry): Promise<void> {
    if (entry.reviewing || reviewed.has(entry.cardId)) return;
    // Panes belong to an open project. A project closed right now is not a refusal: nothing is marked,
    // and the sweep finds the card again the moment it is opened.
    const slot = ports.slotOf(entry.projectPath);
    if (slot === -1) return;
    const pullRequest = finishedIn(entry);
    if (pullRequest === null) return;
    // Asked before anything is removed, counting the card's own pane as the free one it is about to
    // become. If there is still nothing going, nothing is marked and nothing is touched: free a pane
    // and the next tick starts the review, rather than the worktree being destroyed first and the card
    // left carrying a line about a pane that came free a second later.
    if (ports.freePaneIn(slot, entry.pane) === null) return;
    reviewed.add(entry.cardId);
    // Before the swap, and whether or not the swap works: the card is finished and nothing has checked
    // it, which is the whole of what the column says.
    editProjectBoard(entry.projectPath, (board) => intoReview(board, entry.cardId));
    const message = await ports
      .queue(entry.projectPath, () => swapWorktree(ports, entry, pullRequest, slot))
      .catch((error: unknown) => `review failed: ${error instanceof Error ? error.message : String(error)}`);
    // The card is the only place this can be said. A review starts on a timer rather than a keystroke,
    // so there is no status bar waiting on an answer and nothing on screen it belongs to.
    if (message !== '') {
      editProjectBoard(entry.projectPath, (board) => reviewRefused(board, entry.cardId, message));
    }
  }

  // Every card at once rather than one after another. Two cards finishing in the same tick are usually
  // in different projects, and awaiting each in turn would leave the second sitting on `shipped` for
  // however long the first one's git takes, with nothing on screen saying why. Two in the *same*
  // project still go one at a time: that is what the queue is for.
  async function run(): Promise<void> {
    await Promise.all(ports.worktrees().map((entry) => reviewOne(entry)));
  }

  return { run, forget: (cardId) => reviewed.delete(cardId) };
}
