import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readBoard, writeBoard } from '../board/board-store';
import { DASHBOARD_FOLDER_NAME } from '../app/dashboard-folder';
import { emptyBoard, moveCardById, setPullRequest, type Board } from '../../shared/board/board';
import { reviewSweep, type ReviewPorts, type ReviewSweep } from './review-flow';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { temporaryFolder } from '../testing/temporary-folder';

// What review-flow.test.ts and review-flow-clearing.test.ts both build a sweep from.
export const CARD = '7bd176c4-65d3-45b6-8237-58625797ea93';

function folder(): string {
  return temporaryFolder('dashboard-review-');
}

// One card in Backlog. Another id gives a board that parses and has cards on it, none of them this card:
// the deleted card, as against the empty board that has lost every card at once.
export function boardWithCard(pullRequest: number | null, id = CARD): Board {
  const board = emptyBoard();
  const withCard = {
    columns: board.columns.map((column, at) => (at === 0
      ? { ...column, cards: [{ id, title: 'Ship it', notes: '', priority: 'medium' as const, parent: null }] }
      : column)),
  };
  return pullRequest === null ? withCard : setPullRequest(withCard, { column: 0, card: 0 }, pullRequest).board;
}

// The project's card in Done with the pull request card.follow put on it, the one that merged.
export function inDone(pullRequest: number): Board {
  const board = boardWithCard(pullRequest);
  return moveCardById(board, CARD, 5) ?? board;
}

// A project and the worktree beside it, each with a board of its own: the project's is what the sweep
// moves the card on, and the worktree's is where a number that came in with the base sits.
export function flight(pullRequest: number | null): { entry: WorktreeEntry; projectPath: string } {
  const projectPath = folder();
  const worktreePath = folder();
  writeBoard(projectPath, boardWithCard(null));
  mkdirSync(join(worktreePath, DASHBOARD_FOLDER_NAME), { recursive: true });
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

export type Recorded = { removed: string[]; added: string[]; started: { slot: number; prompt: string }[] };

export function ports(entry: WorktreeEntry, over: Partial<ReviewPorts> = {}): { ports: ReviewPorts; log: Recorded } {
  const log: Recorded = { removed: [], added: [], started: [] };
  return {
    log,
    ports: {
      worktrees: () => [entry],
      slotOf: () => 0,
      agentWorksIn: () => false,
      shellLivesIn: async () => false,
      removeWorktree: async (worktreePath) => {
        log.removed.push(worktreePath);
        return { ok: true, message: '', dirty: [] };
      },
      addWorktree: async (added) => { log.added.push(added.branch); },
      startReview: async (started, slot, prompt) => {
        log.started.push({ slot, prompt });
        return { ok: true, entry: started };
      },
      queue: (_key, run) => run(),
      writeBoard: (projectPath, board) => { writeBoard(projectPath, board); },
      arrived: async () => undefined,
      landsPullRequest: () => false,
      reviewFinished: async () => false,
      forgeOf: async () => 'github',
      loopMissing: () => null,
      workflow: '/home/u/.claude/workflows/pr-loop.js',
      loopChecked: () => undefined,
      follow: async () => ({ output: 'ship-it has no pull request' }),
      ...over,
    },
  };
}

// The sweep as main wires it with settings review.autoLoop on: a card noticed goes through card.move,
// whose table starts the review. card.move itself is tested in actions/card/move.test.ts.
export function sweepWith(made: ReviewPorts): ReviewSweep {
  const sweep: ReviewSweep = reviewSweep({
    ...made,
    arrived: (entry) => sweep.review(entry.cardId),
  });
  return sweep;
}

export function columnOfCard(projectPath: string): string {
  const board = readBoard(projectPath).board;
  return board.columns.find((column) => column.cards.some((card) => card.id === CARD))?.name ?? '';
}

export function commentsOnCard(projectPath: string): string[] {
  const board = readBoard(projectPath).board;
  const card = board.columns.flatMap((column) => column.cards).find((entry) => entry.id === CARD);
  return (card?.comments ?? []).map((comment) => comment.body);
}
