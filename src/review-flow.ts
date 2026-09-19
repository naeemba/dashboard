import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_FILE_PATH, parseBoard, readBoard, writeBoard } from './board-store';
import { awaitsReview, intoReview, reviewPrompt, reviewRefused } from './review';
import { allCards, cardById, type Board } from './board';
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
  // Whether an agent is still working in this pane. Not whether one is running: the pane is `exec
  // claude`, and Claude Code sits at its prompt when the card is done rather than exiting, so "a
  // process is there" would be true until somebody closed the pane by hand and no review would ever
  // start by itself. Working is read off the pane's screen, which only the renderer can see; main.ts
  // says how the answer gets there.
  agentWorksIn: (slot: number, pane: number | null) => boolean;
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
//
// The working copy, and not `git show HEAD:` of the same path, which is the obvious answer to the
// number being readable a moment before the commit that makes it true. Two reasons it is not taken.
// It would not close the hole: `/work-card` pushes the commit carrying the number and keeps going —
// the /simplify pass this repo asks for, a follow-up commit — so a worktree can be dirty long after
// the number is committed, and the swap has to survive that anyway. And it would put a `git show`
// per in-flight worktree on a five-second timer for the whole life of the app, to spare a refusal
// that costs nothing when nothing is stuck. swapWorktree is where the window is handled instead.
function finishedIn(entry: WorktreeEntry): number | null {
  try {
    const text = readFileSync(join(entry.worktreePath, BOARD_FILE_PATH), 'utf8');
    return cardById(parseBoard(text), entry.cardId)?.pullRequest ?? null;
  } catch {
    return null;
  }
}

// The project's board, or null when it cannot be read at all. Null is not "no card here": a board the
// sweep cannot open says nothing about whether the card has been reviewed, and the guard below leaves
// the card alone rather than acting on an answer it does not have. A board that opens but does not
// mention the card is the same silence, said by awaitsReview instead.
function projectBoard(projectPath: string): Board | null {
  try {
    return readBoard(projectPath).board;
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

// How a swap ended. `message` is what to say on the card, empty when there is nothing to say, and
// `again` is whether the next tick should try this card once more.
//
// Those are two questions rather than one because a dirty worktree answers them differently from
// every other refusal: it is not a review that failed, it is a review that is early.
type Swap = { message: string; again: boolean };

async function swapWorktree(
  ports: ReviewPorts,
  entry: WorktreeEntry,
  pullRequest: number,
  slot: number,
): Promise<Swap> {
  // Not forced. What is uncommitted in a worktree exists nowhere else, and an agent that left
  // something behind is exactly the case worth stopping for — the card still lands in Review, and the
  // line on it names the branch to go and look at.
  const removed = await ports.removeWorktree(entry.worktreePath, false);
  if (!removed.ok) {
    if (removed.dirty.length === 0) return { message: removed.message, again: false };
    // Uncommitted files are usually the agent's own last breath. The pull request number is written
    // onto the branch's board and then committed, and a write and its commit are never the same act,
    // so there is always a window where the number is on disk and the commit is not — and git will
    // not give up a worktree with a change in it. A moment later it would. So the card is asked about
    // again on the next tick rather than written off for the rest of the run. `/work-card` asks for
    // both in one shell command to keep that window short, which narrows it and cannot close it.
    //
    // A worktree that stays dirty — an agent that really did walk away mid-change — is the price, and
    // this paragraph is the only thing that names it. Unmarked, the card runs the whole of reviewOne
    // again every five seconds for as long as the app is open: the branch's board read and parsed,
    // the project's read and parsed three times over, and one `git status`. The two board writes and
    // the removal are never reached — the card is already in Review and already carries this line, so
    // both edits come back null — which is what keeps it to reads.
    //
    // Small reads on a five-second timer, against a pull request that would otherwise sit unreviewed
    // until somebody restarted the app. If a board ever grows big enough for that to be felt, the
    // thing to do is ask git whether the worktree is dirty before the mark rather than after, not to
    // go back to writing the card off.
    //
    // No file count in it. This is the one line the sweep writes again on every tick, and reviewRefused
    // only recognises a repeat by matching the whole sentence — so a count would make `2 uncommitted
    // files` and `3 uncommitted files` two different lines and stack both on the card as the agent
    // saves. The branch is named; the files are a `git status` away.
    return { message: `uncommitted changes in ${entry.branch}, waiting for the commit`, again: true };
  }
  await ports.addWorktree(entry);
  const started = ports.startReview(
    { ...entry, pane: null, reviewing: true },
    slot,
    reviewPrompt(entry.cardId, pullRequest, entry.projectPath, entry.title),
  );
  return { message: started.ok ? '' : started.message, again: false };
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
  // Cards a review has already been started for, tried for and refused, or finished in a run before
  // this one. Kept for the run rather than on the record, because the record only changes when the swap
  // works: one that stopped short leaves the old entry exactly as it was, and without this the sweep
  // would find the same finished card on the next tick and spawn git at it again for as long as the
  // app is open.
  //
  // The one refusal that comes back off is a worktree with uncommitted files in it. That is the agent
  // still finishing rather than a review that failed, and swapWorktree says why it is the exception.
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
    // The pull request number is not the agent being done. `/work-card` pushes the commit carrying it
    // and keeps going — the /simplify pass this repo asks for, a follow-up commit, its own summary — so
    // taking the folder away here kills the shell before `git push` runs and the fix never reaches the
    // pull request the review is about to merge. Nothing is marked, so the sweep picks the card up
    // the moment the agent stops working.
    if (ports.agentWorksIn(slot, entry.pane)) return;
    const pullRequest = finishedIn(entry);
    if (pullRequest === null) return;
    // A card that has already been through this. The number on the branch's board is written once and
    // stays written, so it goes on saying "finished" long after the review that read it merged the
    // pull request — and the record outlives the review too, since the review worktree is removed by
    // hand. The project's board is what tells the two apart; review.ts holds why it is the only thing
    // that can. Marked rather than just skipped, so a card whose worktree is left lying around does
    // not cost a board read every five seconds for the rest of the run.
    const board = projectBoard(entry.projectPath);
    const awaits = board === null ? null : awaitsReview(board, entry.cardId);
    if (awaits === false) {
      reviewed.add(entry.cardId);
      return;
    }
    // Neither answer: no board to read, or a board with no row for this card — the card was deleted after
    // its review, or a board.json that would not parse was moved aside and the empty one that replaced it
    // has lost every card at once. Nothing is touched either way, because the one thing the sweep can say
    // about a card it cannot find is written on that card.
    //
    // Whether it is marked is the difference between those two. A deleted card is never coming back with
    // that id and its worktree stays on disk — the review prompt says not to remove it — so leaving it
    // unmarked costs two board reads every five seconds for the rest of the run, which is the cost the
    // branch above marks to avoid. A board that was moved aside is the opposite: restore it from git and
    // every card is back, and a sweep that marked them all in between would start no review again until
    // you restarted, with nothing on screen saying why. An empty board is that case, so a board with
    // cards on it that does not have this one is the deletion, and only that one is marked.
    //
    // What that costs, and it is a real card: the same id can come back. `d` deletes and `u` puts the
    // board back with the card exactly as it was, and `git checkout .dashboard/board.json` undoes a
    // `board` command that dropped one card off a board that still has others. Either is the deletion
    // as far as this line is concerned, and one tick — five seconds — is all it takes to land in
    // between. The card is then back in Ship reading `shipped · fix-login · terminal 3`, with its
    // worktree still on disk and its pull request number still on the branch's board, and no review
    // ever starts for it again until you restart the app or ship the card again. The mark stays anyway:
    // asking the board whether the card has come back is the read the mark exists to avoid, so there is
    // no cheap version of this that covers it. If it becomes worth more than this paragraph, `forget`
    // is already exported and `board:change` already fires in main for every open project's folder.
    if (awaits === null) {
      if (board !== null && allCards(board).length > 0) reviewed.add(entry.cardId);
      return;
    }
    // Asked before anything is removed, counting the card's own pane as the free one it is about to
    // become. If there is still nothing going, nothing is marked and nothing is touched: free a pane
    // and the next tick starts the review, rather than the worktree being destroyed first and the card
    // left carrying a line about a pane that came free a second later.
    if (ports.freePaneIn(slot, entry.pane) === null) return;
    reviewed.add(entry.cardId);
    // Before the swap, and whether or not the swap works: the card is finished and nothing has checked
    // it, which is the whole of what the column says.
    editProjectBoard(entry.projectPath, (board) => intoReview(board, entry.cardId));
    const swap = await ports
      .queue(entry.projectPath, () => swapWorktree(ports, entry, pullRequest, slot))
      .catch((error: unknown) => ({
        message: `review failed: ${error instanceof Error ? error.message : String(error)}`,
        again: false,
      }));
    // The mark comes back off for a card that was only early. Everything else keeps it: a locked
    // repository, a pane that went, a git step that threw — none of those pass by themselves, and
    // the card carries the line saying so until somebody acts on it.
    if (swap.again) reviewed.delete(entry.cardId);
    // The card is the only place this can be said. A review starts on a timer rather than a keystroke,
    // so there is no status bar waiting on an answer and nothing on screen it belongs to.
    if (swap.message !== '') {
      editProjectBoard(entry.projectPath, (board) => reviewRefused(board, entry.cardId, swap.message));
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
