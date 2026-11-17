import type { ShipRequest, ShipResult, WorktreeEntry } from '../../shared/app/bridge';
import { failureText } from '../../shared/errors/failure';
import { baseBranch, git } from '../app/git';
import { isManagerPath } from '../../shared/manager/manager';
import { blockingChanges, uncommittedCount, workPrompt } from './ship';
import { entryForCard } from './worktree-store';
import type { ShipWorktree, ShipWorktreeRequest } from '../actions/worktree/make';

// A card moved into Ship: the worktree, the branch, the board move and the pane. Out of main.ts because
// main had reached its 600-line ceiling; what it needs from there is the records and the panes, handed
// over as ports. The decisions inside are ship.ts's and are tested there.

export type ShipPorts = {
  worktrees(): readonly WorktreeEntry[];
  recordWorktree(entry: WorktreeEntry): WorktreeEntry;
  // worktree.make's card kind: a new branch off origin/<base>, in the folder every worktree goes in.
  makeWorktree(request: ShipWorktreeRequest): Promise<ShipWorktree>;
  // A free worker for the card's agent, or a new one; main.ts says how it picks.
  attachPane(entry: WorktreeEntry, slot: number, prompt: string): Promise<ShipResult>;
  // Whether a card shipped in the project bumps its version: its projects.yaml entry, off by default.
  bumpsVersion(projectPath: string): boolean;
  agentRunsIn(slot: number, pane: number | null): boolean;
  dropDeadWorktrees(): void;
  forgetReview(cardId: string): void;
  // Ships in one project run one after another, never together; ship.ts says why.
  queue<T>(projectPath: string, run: () => Promise<T>): Promise<T>;
};

export function shipFlow(ports: ShipPorts): (request: ShipRequest) => Promise<ShipResult> {
  // The cards whose ship is running right now. Two ships of one card both get past the already-shipped
  // check before either has recorded anything, and the second record replaces the first: two branches
  // and two folders on disk, and the one nothing points at can neither be seen nor removed from inside
  // the app.
  const shippingCards = new Set<string>();
  // Read at each ship, so a hand edit of projects.yaml holds from the next one.
  const prompt = (projectPath: string, cardId: string, base: string) => workPrompt(cardId, ports.bumpsVersion(projectPath), base);

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

    const { branch, worktreePath } = await ports.makeWorktree({ projectPath, title, cardId, base });

    // Recorded the moment the folder is on disk, and before the pane, so a worktree that exists is always
    // one the worktree list can show you and remove. An orphan worktree nothing knows about is the thing
    // that piles up unseen.
    //
    // The branch gets no board commit. The card's columns are origin's main's, moved by the app (Doing
    // when the agent starts, then from the pull request); a card file on the branch rides the merge into
    // main and puts the card back in whatever column the branch said (ship-decision-3).
    const entry = ports.recordWorktree({
      cardId, title, projectPath, branch, worktreePath, pane: null, startedAt: new Date().toISOString(),
      reviewing: false,
    });
    return ports.attachPane(entry, slot, prompt(projectPath, cardId, base));
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
        // stopped part way — the project closed mid-ship, or a step failed after the worktree was made —
        // or one whose agent has since exited. Either way the worktree is there and only the agent is
        // missing. Queued like a first ship, because it reads the repository's base branch.
        // `reviewing: false` is the other half of the forget above. A record that was the review keeps
        // the flag through this spread otherwise, and the sweep skips the card for good: the pull
        // request this ship opens is never reviewed, with nothing on screen saying why.
        return ports.attachPane({ ...existing, reviewing: false }, slot, prompt(projectPath, cardId, await baseBranch(projectPath)));
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
