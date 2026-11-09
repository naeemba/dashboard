import type { Channels } from '../../app/channels';
import type { ShipResult, WorktreeEntry } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { shipEntry } from '../../../shared/app/log-entry';
import { REVIEW_COLUMN, type Board } from '../../../shared/board/board';
import type { BoardChanges } from '../../board/board-changes';
import type { BoardSyncQueue } from '../../board/board-sync-queue';
import { readBoard, writeBoard } from '../../board/board-store';
import { realPath } from '../../app/real-path';
import { isProjectBoard } from './project-board';
import { isLinkedWorktree } from '../../board/linked-worktree';
import { reviewSweep, type ReviewPorts, type ReviewSweep } from '../../ship/review-flow';
import { entryForCard } from '../../ship/worktree-store';
import { isFollowed, type PullRequest } from '../../board/pull-request-column';
import { pullRequestSweep, type PullRequestSweep } from '../../board/pull-request-sweep';
import { shipFlow, type ShipPorts } from '../../ship/ship-flow';
import { bind, registerActions, type BoundAction } from '../action';
import { cardFollow } from './follow';
import { cardMove } from './move';
import { cardReview } from './review';
import { cardShip } from './ship';
import { cardStart } from './start';

// What only main.ts holds, handed over once. Main-process wiring (workflow-rule-2's exemption): every
// decision is in the actions, ship-flow.ts and review-flow.ts.
export type CardActionsMain = Omit<ShipPorts, 'forgetReview'>
  & Omit<ReviewPorts, 'worktrees' | 'queue' | 'writeBoard' | 'arrived'> & {
    table: Channels;
    boardLog: BoardChanges;
    // Every board write here goes to origin behind it (board-sync-queue.ts).
    boardSync: BoardSyncQueue;
    // settings.review.autoLoop, read at each move so a change on the settings screen holds at once.
    autoLoop(): boolean;
    log(draft: LogDraft): void;
    // `gh pr list` for a branch, in the project (pull-request-column.ts reads its answer).
    pullRequestOf(projectPath: string, branch: string): Promise<PullRequest | null>;
  };

export type CardActions = {
  reviews: ReviewSweep;
  // Every card's column set from its pull request: the app's to run, so no verb of the command.
  pullRequests: PullRequestSweep;
  // card.start, for `pane run --card`: a ship calls it itself.
  start: BoundAction;
  actions: BoundAction[];
};

export function cardActions(main: CardActionsMain): CardActions {
  // The sweep's own writes go through the move log, so the watcher's read-back finds the board it
  // already holds and does not log the sweep's move as the `board` command's.
  const writeLogged = (projectPath: string, board: Board) => main.boardLog.wrote(projectPath, board, () => writeBoard(projectPath, board));
  const published = (projectPath: string) => main.boardSync.sync(projectPath);
  // Every write here, then to origin behind it.
  const writeAndSync = (projectPath: string, board: Board, logged: boolean) => {
    if (logged) writeLogged(projectPath, board);
    else writeBoard(projectPath, board);
    void published(projectPath);
  };

  const reviews: ReviewSweep = reviewSweep({
    ...main,
    writeBoard: (projectPath, board) => writeAndSync(projectPath, board, true),
    arrived: (entry: WorktreeEntry) => move.call({ projectPath: entry.projectPath, id: entry.cardId, column: REVIEW_COLUMN, source: 'automatic' }),
  });
  const shipCard = shipFlow({ ...main, forgetReview: (cardId) => reviews.forget(cardId) });

  const move = bind(cardMove, {
    read: (projectPath) => readBoard(projectPath, false),
    // A move from the command is written plainly, so the watcher logs it as the command's, as it did
    // when the command wrote the file itself.
    write: (projectPath, board, source) => writeAndSync(projectPath, board, source === 'automatic'),
    published,
    projectBoard: (projectPath) => isProjectBoard(projectPath, main.worktrees().map((entry) => entry.worktreePath), realPath, isLinkedWorktree),
    autoLoop: main.autoLoop,
    ship: (input) => ship.call(input),
    review: (input) => review.call(input),
  });
  const ship = bind(cardShip, {
    read: (projectPath) => readBoard(projectPath, false).board,
    slotOf: main.slotOf,
    ship: async (request): Promise<ShipResult> => {
      const result = await shipCard(request);
      main.log(shipEntry(request, result));
      if (result.ok) await start.call({ projectPath: request.projectPath, id: request.cardId, branch: result.entry.branch });
      return result;
    },
  });
  const review = bind(cardReview, { review: ({ id }) => reviews.review(id) });
  const read = (projectPath: string) => readBoard(projectPath, false);
  const start = bind(cardStart, { read, write: (projectPath, board) => writeAndSync(projectPath, board, true) });
  const worktreeBranch = (projectPath: string, id: string) => {
    const entry = entryForCard(main.worktrees(), id);
    return entry?.projectPath === projectPath ? entry.branch : undefined;
  };
  const follow = bind(cardFollow, {
    read,
    worktreeBranch,
    pullRequestOf: main.pullRequestOf,
    write: (projectPath, board) => writeAndSync(projectPath, board, true),
    move: (input) => move.call(input),
    now: Date.now,
  });
  const pullRequests = pullRequestSweep({
    followed(projectPath) {
      const { board } = read(projectPath);
      return board.columns.flatMap((column) => column.cards
        .filter((card) => isFollowed(card, column.name, card.branch ?? worktreeBranch(projectPath, card.id), Date.now()))
        .map((card) => card.id));
    },
    // A refusal is a card the board no longer has, or a file that does not parse: the card is left
    // alone and the next check asks again. Only gh's failure throws.
    follow: (projectPath, id) => follow.call({ projectPath, id }),
    warn: (project, message) => main.log({ level: 'warn', kind: 'board', project, message }),
    now: Date.now,
  });

  // Every action is a board verb; only card.move has a channel, because it is the only one the bridge
  // exposes. A screen that needs ship or review gets its channel in the same change.
  // action.test.ts pins both lists against what is served here.
  registerActions(main.table, [move]);
  return { reviews, pullRequests, start, actions: [move, ship, review] };
}
