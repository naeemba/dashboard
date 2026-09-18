import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, readBoard, writeBoard } from './board-store';
import { emptyBoard, moveCardById, setPullRequest, type Board } from './board';
import { reviewSweep, type ReviewPorts } from './review-flow';
import type { WorktreeEntry } from './worktree-store';

const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-review-'));
}

// One card in Todo. Another id gives a board that parses and has cards on it, none of them this card:
// the deleted card, as against the empty board that has lost every card at once.
function boardWithCard(pullRequest: number | null, id = CARD): Board {
  const board = emptyBoard();
  const withCard = {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
      : column)),
  };
  return pullRequest === null ? withCard : setPullRequest(withCard, { column: 0, card: 0 }, pullRequest).board;
}

// A project and the worktree beside it, each with a board of its own: the project's is what the sweep
// moves the card on, and the worktree's is what the agent wrote its pull request number into.
function flight(pullRequest: number | null): { entry: WorktreeEntry; projectPath: string } {
  const projectPath = folder();
  const worktreePath = folder();
  writeBoard(projectPath, boardWithCard(null));
  mkdirSync(join(worktreePath, BOARD_DIRECTORY), { recursive: true });
  writeBoard(worktreePath, boardWithCard(pullRequest));
  return {
    projectPath,
    entry: {
      cardId: CARD,
      title: 'Ship it',
      projectPath,
      branch: 'ship-it',
      worktreePath,
      pane: 3,
      startedAt: '2026-09-16T09:00:00.000Z',
      reviewing: false,
    },
  };
}

type Recorded = { removed: string[]; added: string[]; started: { slot: number; prompt: string }[] };

function ports(entry: WorktreeEntry, over: Partial<ReviewPorts> = {}): { ports: ReviewPorts; log: Recorded } {
  const log: Recorded = { removed: [], added: [], started: [] };
  return {
    log,
    ports: {
      worktrees: () => [entry],
      slotOf: () => 0,
      agentWorksIn: () => false,
      freePaneIn: () => 0,
      removeWorktree: async (worktreePath) => {
        log.removed.push(worktreePath);
        return { ok: true, message: '', dirty: [] };
      },
      addWorktree: async (added) => { log.added.push(added.branch); },
      startReview: (started, slot, prompt) => {
        log.started.push({ slot, prompt });
        return { ok: true, entry: started };
      },
      queue: (_key, run) => run(),
      ...over,
    },
  };
}

function columnOfCard(projectPath: string): string {
  const board = readBoard(projectPath).board;
  return board.columns.find((column) => column.cards.some((card) => card.id === CARD))?.name ?? '';
}

function commentsOnCard(projectPath: string): string[] {
  const board = readBoard(projectPath).board;
  const card = board.columns.flatMap((column) => column.cards).find((entry) => entry.id === CARD);
  return (card?.comments ?? []).map((comment) => comment.body);
}

describe('reviewSweep', () => {
  it('moves the card into Review and swaps the worktree for one that reviews it', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry);
    await reviewSweep(made).run();
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(log.added).toEqual(['ship-it']);
    expect(log.started[0].prompt).toContain('/pr-loop 12');
  });

  // The pull request number is the whole signal. Until it is there the agent is still working, and a
  // sweep that took its worktree away would take the work with it.
  it('leaves a card whose agent has not opened a pull request alone', async () => {
    const { entry, projectPath } = flight(null);
    const { ports: made, log } = ports(entry);
    await reviewSweep(made).run();
    expect(columnOfCard(projectPath)).toBe('Todo');
    expect(log.removed).toEqual([]);
  });

  it('does not start a second review for a worktree that is already reviewing', async () => {
    const { entry } = flight(12);
    const { ports: made, log } = ports({ ...entry, reviewing: true });
    await reviewSweep(made).run();
    expect(log.removed).toEqual([]);
  });

  // The number lands on the card mid-run: /work-card pushes that commit and keeps going. Take the
  // folder then and `git worktree remove` kills the shell before the next push, so a commit that is on
  // the branch never reaches the pull request the review is about to merge.
  it('waits for the agent that opened the pull request to stop working', async () => {
    const { entry, projectPath } = flight(12);
    let working = true;
    const { ports: made, log } = ports(entry, { agentWorksIn: () => working });
    const sweep = reviewSweep(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Todo');
    // Nothing was marked, so the tick after it goes quiet picks the card up.
    working = false;
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // A review that ended the way it was meant to leaves its worktree on disk — the prompt says not to
  // remove it — and the pull request number stays written on the branch's board. Restart the app and
  // the mark on the record is gone with the pane, so the card's own column is the only thing left
  // saying the review already happened.
  it('leaves a card the review already moved past Review alone', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 4) ?? boardWithCard(null));
    const { ports: made, log } = ports(entry);
    const sweep = reviewSweep(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Done');
  });

  // The card is still in Review, so nothing reviewed it to the end: the shell died with the app. That
  // one is reviewed again, which is what losing a review means.
  it('reviews a card again when the last review died in Review', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, moveCardById(boardWithCard(null), CARD, 3) ?? boardWithCard(null));
    const { ports: made, log } = ports(entry);
    await reviewSweep(made).run();
    expect(log.removed).toEqual([entry.worktreePath]);
    expect(columnOfCard(projectPath)).toBe('Review');
  });

  // The card has left the project's board — deleted once its review was done, or lost with a board.json
  // that would not parse and was moved aside. The worktree outlives it by design, and a board that does
  // not mention the card cannot say whether it has been reviewed, so the sweep says nothing and touches
  // nothing: reviewing it would re-cut the worktree and run /pr-loop at a pull request that merged weeks
  // ago, with no card anywhere to print that on.
  it('leaves a card the project board no longer mentions alone', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, emptyBoard());
    const { ports: made, log } = ports(entry);
    await reviewSweep(made).run();
    expect(log.removed).toEqual([]);
    expect(log.started).toEqual([]);
  });

  // The deleted card. Its worktree stays on disk for good, so without the mark it reads two boards every
  // five seconds for the rest of the run for an answer that cannot change.
  it('asks once about a card a populated board has lost', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, boardWithCard(null, 'b0a1'));
    const { ports: made, log } = ports(entry);
    const sweep = reviewSweep(made);
    await sweep.run();
    // Put the card back and it stays marked: that id is gone, and a ship of a new card calls forget.
    writeBoard(projectPath, boardWithCard(null));
    await sweep.run();
    expect(log.removed).toEqual([]);
  });

  // The salvaged board. Every card is missing at once and every one of them comes back the moment the
  // file is restored, so marking here would stop reviews until the app was restarted.
  it('asks again about a card an empty board has lost once the board is back', async () => {
    const { entry, projectPath } = flight(12);
    writeBoard(projectPath, emptyBoard());
    const { ports: made, log } = ports(entry);
    const sweep = reviewSweep(made);
    await sweep.run();
    writeBoard(projectPath, boardWithCard(null));
    await sweep.run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // Panes belong to an open project. Nothing is marked, so opening the project starts the review.
  it('waits for a closed project rather than refusing the card', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, { slotOf: () => -1 });
    const sweep = reviewSweep(made);
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(columnOfCard(projectPath)).toBe('Todo');
  });

  // The pane question is asked before the worktree is destroyed, counting the card's own pane as the
  // free one it is about to become — so a card that has one is never held up by the other four.
  it('waits for a pane when the card never had one of its own', async () => {
    const { entry } = flight(12);
    const { ports: made, log } = ports({ ...entry, pane: null }, { freePaneIn: () => null });
    await reviewSweep(made).run();
    expect(log.removed).toEqual([]);
  });

  it('swaps a card that has a pane even when every other pane is taken', async () => {
    const { entry } = flight(12);
    const { ports: made, log } = ports(entry, {
      // The one the card is holding, and nothing else.
      freePaneIn: (_slot, freeing) => freeing,
    });
    await reviewSweep(made).run();
    expect(log.removed).toEqual([entry.worktreePath]);
  });

  // Nothing on screen is waiting on a review, so the card is the only place this can be said.
  it('lands the card in Review and says on it when the worktree is dirty', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => ({ ok: false, message: '', dirty: ['src/a.ts', 'src/b.ts'] }),
    });
    await reviewSweep(made).run();
    expect(columnOfCard(projectPath)).toBe('Review');
    expect(log.added).toEqual([]);
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: 2 uncommitted files in ship-it']);
  });

  // The refusal leaves the record exactly as it was, so only the mark stops the next tick spawning git
  // at the same card again — and the card growing a second identical comment every five seconds.
  it('tries a refused card once and not again', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made, log } = ports(entry, {
      removeWorktree: async () => ({ ok: false, message: 'not removed: locked', dirty: [] }),
    });
    const sweep = reviewSweep(made);
    await sweep.run();
    await sweep.run();
    expect(log.removed).toEqual([]);
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: not removed: locked']);
  });

  // Shipping the card again is a new pull request, and it has to be reviewable.
  it('reviews a card again once it has been shipped again', async () => {
    const { entry } = flight(12);
    let attempts = 0;
    const { ports: made } = ports(entry, {
      removeWorktree: async () => {
        attempts += 1;
        return { ok: false, message: 'not removed: locked', dirty: [] };
      },
    });
    const sweep = reviewSweep(made);
    await sweep.run();
    await sweep.run();
    expect(attempts).toBe(1);
    sweep.forget(CARD);
    await sweep.run();
    expect(attempts).toBe(2);
  });

  // The worktree is swapped by then, so the only thing left to say is on the card.
  it('says on the card when the pane could not be taken', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made } = ports(entry, {
      startReview: () => ({ ok: false, message: 'api was closed mid-ship' }),
    });
    await reviewSweep(made).run();
    expect(commentsOnCard(projectPath)).toEqual(['No review worktree: api was closed mid-ship']);
  });

  // git throwing must not take the sweep down with it, and the card has to say what happened.
  it('puts a step that threw on the card rather than letting it escape', async () => {
    const { entry, projectPath } = flight(12);
    const { ports: made } = ports(entry, {
      addWorktree: async () => { throw new Error('fatal: ship-it is already checked out'); },
    });
    await reviewSweep(made).run();
    expect(commentsOnCard(projectPath))
      .toEqual(['No review worktree: review failed: fatal: ship-it is already checked out']);
  });
});
