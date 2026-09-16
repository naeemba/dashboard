import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_DIRECTORY, readBoard, writeBoard } from './board-store';
import { emptyBoard, setPullRequest, type Board } from './board';
import { reviewSweep, type ReviewPorts } from './review-flow';
import type { WorktreeEntry } from './worktree-store';

const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'dashboard-review-'));
}

function boardWithCard(pullRequest: number | null): Board {
  const board = emptyBoard();
  const withCard = {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id: CARD, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
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
