import type { ShipRequest, ShipResult } from './bridge';
import { moveCardById, shipColumnIndex } from './board';
import { BOARD_FILE_PATH, readBoard, writeBoard } from './board-store';
import { failureText } from './failure';
import { baseBranch, git } from './git';
import { isManagerPath } from './manager';
import { blockingChanges, branchNameFor, uncommittedCount, workPrompt, worktreePathFor } from './ship';
import { entryForCard, type WorktreeEntry } from './worktree-store';

// A card moved into Ship: the worktree, the branch, the board move and the pane. Out of main.ts because
// main had reached its 600-line ceiling; what it needs from there is the records and the panes, handed
// over as ports. The decisions inside are ship.ts's and are tested there.

export type ShipPorts = {
  worktrees(): readonly WorktreeEntry[];
  recordWorktree(entry: WorktreeEntry): WorktreeEntry;
  // A free worker for the card's agent, or a new one; main.ts says how it picks.
  attachPane(entry: WorktreeEntry, slot: number, prompt: string): ShipResult;
  agentRunsIn(slot: number, pane: number | null): boolean;
  dropDeadWorktrees(): void;
  forgetReview(cardId: string): void;
  // Ships in one project run one after another, never together; ship.ts says why.
  queue<T>(projectPath: string, run: () => Promise<T>): Promise<T>;
};

// The card's Ship move, on the branch. The only board write that belongs to a ship; the agent makes
// every move after it. The Ship column is there to move it into whatever the branch's file holds:
// readBoard gives every board one, and a board with no file at all is the shipped four columns.
//
// Run again by a ship that is being finished rather than started, so it has to be safe to repeat: a
// card already in Ship stages nothing, and `git commit` with nothing to commit exits 1, which would
// fail the ship in git's own words with the branch and the folder already made. Nothing staged also
// covers the card never having been on the base branch's board at all.
async function commitShipMove(entry: WorktreeEntry): Promise<void> {
  const board = readBoard(entry.worktreePath).board;
  const moved = moveCardById(board, entry.cardId, shipColumnIndex(board));
  if (!moved) return;
  writeBoard(entry.worktreePath, moved);
  // Both halves name the board file. A resumed ship runs in a worktree that has been lived in, so
  // "is anything staged" would answer yes to whatever the agent had `git add`ed and commit its
  // half-finished work under a board message.
  await git(['add', BOARD_FILE_PATH], entry.worktreePath);
  const staged = await git(['diff', '--cached', '--name-only', '--', BOARD_FILE_PATH], entry.worktreePath);
  if (staged !== '') {
    await git(['commit', '-m', `board: ship "${entry.title}"`, '--', BOARD_FILE_PATH], entry.worktreePath);
  }
}

export function shipFlow(ports: ShipPorts): (request: ShipRequest) => Promise<ShipResult> {
  // The cards whose ship is running right now. Two ships of one card both get past the already-shipped
  // check before either has recorded anything, and the second record replaces the first: two branches
  // and two folders on disk, and the one nothing points at can neither be seen nor removed from inside
  // the app.
  const shippingCards = new Set<string>();

  // The whole ship, in the order the design doc sets out. Each step's failure stops the flow and comes
  // back as a message the board's status bar prints; everything before it is left as it was. Every git
  // command below runs with the project's queue held, so nothing else here is touching this repository.
  async function runShip(request: ShipRequest): Promise<ShipResult> {
    const { projectPath, cardId, title, slot } = request;
    const dirty = blockingChanges(await git(['status', '--porcelain'], projectPath));
    if (dirty.length > 0) {
      return { ok: false, message: `${uncommittedCount(dirty)} — commit or stash them first` };
    }

    const base = await baseBranch(projectPath);
    await git(['fetch', 'origin', base], projectPath);
    // The checkout itself is only fast-forwarded when it is sitting on the base branch and can be.
    // A checkout on some other branch is left alone — the worktree comes off origin/<base> either
    // way, so it does not need the local branch to have caught up.
    try {
      const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
      if (head === base) await git(['merge', '--ff-only', `origin/${base}`], projectPath);
    } catch {
      // Diverged, or mid-rebase. The worktree is what matters and it comes off the remote.
    }

    const heads = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], projectPath);
    const branch = branchNameFor(title, cardId, heads.split('\n').filter((name) => name !== ''));
    const worktreePath = worktreePathFor(projectPath, branch);
    await git(['worktree', 'add', '-b', branch, worktreePath, `origin/${base}`], projectPath);

    // Recorded the moment the folder is on disk, and before the pane and before the commit below, so a
    // worktree that exists is always one the worktree list can show you and remove. An orphan worktree
    // nothing knows about is the thing that piles up unseen.
    const entry = ports.recordWorktree({
      cardId, title, projectPath, branch, worktreePath, pane: null, startedAt: new Date().toISOString(),
      reviewing: false,
    });

    await commitShipMove(entry);
    return ports.attachPane(entry, slot, workPrompt(cardId));
  }

  return async function shipCard(request: ShipRequest): Promise<ShipResult> {
    const { projectPath, cardId, title, slot } = request;
    // The board already declines to ship from the manager's page. This is the second lock, for a caller
    // that gets past it: with no project behind it, git would run in whatever folder the app started in.
    if (isManagerPath(projectPath)) return { ok: false, message: `"${title}" is on the manager's board, which has no repository to ship from` };
    ports.dropDeadWorktrees();
    // A card being shipped is a card whose last review, if it had one, is over. Left marked, the pull
    // request this ship goes on to open would never be reviewed for the rest of the run, with nothing
    // saying why. This is half the mark; the other half is `reviewing` on the record, cleared below.
    ports.forgetReview(cardId);

    // Already shipped, and still being worked on — a second worktree for the same card is the mistake
    // the record exists to catch. The pane on the record is not the question: a record keeps naming its
    // pane after the agent exits, so Enter on the worktree list still lands on the shell it left behind.
    // What refuses the ship is an agent actually running in there.
    const existing = entryForCard(ports.worktrees(), cardId);
    if (existing && ports.agentRunsIn(slot, existing.pane)) {
      return { ok: false, message: `"${title}" is already shipped on ${existing.branch}` };
    }

    // Two ships of one card are a mistake and are refused. Two of different cards in one project are
    // both wanted, so the second waits behind the first rather than racing it onto git's index lock.
    if (shippingCards.has(cardId)) return { ok: false, message: `"${title}" is already being shipped` };
    shippingCards.add(cardId);
    try {
      return await ports.queue(projectPath, async () => {
        if (!existing) return runShip(request);
        // An existing record that got past the refusal is a card nothing is running for: a ship that
        // stopped part way — the project closed mid-ship, or a step failed after the worktree was made — or one whose agent has
        // since exited. Which of those it was is not written down, so this finishes the work
        // rather than assuming only the pane is missing — an agent started in a worktree whose Ship move
        // is sitting uncommitted would have nothing left to commit it. Queued like a first ship, because
        // it runs git in the same repository.
        await commitShipMove(existing);
        // `reviewing: false` is the other half of the forget above. A record that was the review keeps
        // the flag through this spread otherwise, and the sweep skips the card for good: the pull
        // request this ship opens is never reviewed, with nothing on screen saying why.
        return ports.attachPane({ ...existing, reviewing: false }, slot, workPrompt(cardId));
      });
    } catch (error: unknown) {
      return { ok: false, message: `ship failed: ${failureText(error)}` };
    } finally {
      // In a finally, so a step that throws cannot leave the card locked for the rest of the run with
      // nothing on screen able to clear it.
      shippingCards.delete(cardId);
    }
  };
}
