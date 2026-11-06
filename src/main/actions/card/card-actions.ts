import type { Channels } from '../../app/channels';
import type { ShipResult, WorktreeEntry } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { shipEntry } from '../../../shared/app/log-entry';
import { REVIEW_COLUMN, type Board } from '../../../shared/board/board';
import type { BoardChanges } from '../../board/board-changes';
import { readBoard, writeBoard } from '../../board/board-store';
import { realPath } from '../../ship/worktree-scan';
import { isProjectBoard } from './project-board';
import { reviewSweep, type ReviewPorts, type ReviewSweep } from '../../ship/review-flow';
import { shipFlow, type ShipPorts } from '../../ship/ship-flow';
import { bind, registerActions, type BoundAction } from '../action';
import { cardMove } from './move';
import { cardReview } from './review';
import { cardShip } from './ship';

// What only main.ts holds, handed over once. Main-process wiring (workflow-rule-2's exemption): every
// decision is in the actions, ship-flow.ts and review-flow.ts.
export type CardActionsMain = Omit<ShipPorts, 'forgetReview'>
  & Omit<ReviewPorts, 'worktrees' | 'queue' | 'writeBoard' | 'arrived'> & {
    table: Channels;
    boardLog: BoardChanges;
    // settings.review.autoLoop, read at each move so a change on the settings screen holds at once.
    autoLoop(): boolean;
    log(draft: LogDraft): void;
  };

export function cardActions(main: CardActionsMain): { reviews: ReviewSweep; actions: BoundAction[] } {
  // The sweep's own writes go through the move log, so the watcher's read-back finds the board it
  // already holds and does not log the sweep's move as the `board` command's.
  const writeLogged = (projectPath: string, board: Board) => main.boardLog.wrote(projectPath, board, () => writeBoard(projectPath, board));

  const reviews: ReviewSweep = reviewSweep({
    ...main,
    writeBoard: writeLogged,
    arrived: (entry: WorktreeEntry) => move.call({ projectPath: entry.projectPath, id: entry.cardId, column: REVIEW_COLUMN, source: 'automatic' }),
  });
  const shipCard = shipFlow({ ...main, forgetReview: (cardId) => reviews.forget(cardId) });

  const move = bind(cardMove, {
    read: (projectPath) => readBoard(projectPath, false),
    // A move from the command is written plainly, so the watcher logs it as the command's, as it did
    // when the command wrote the file itself.
    write: (projectPath, board, source) => (source === 'automatic' ? writeLogged(projectPath, board) : writeBoard(projectPath, board)),
    projectBoard: (projectPath) => isProjectBoard(projectPath, main.worktrees().map((entry) => entry.worktreePath), realPath),
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
      return result;
    },
  });
  const review = bind(cardReview, { review: ({ id }) => reviews.review(id) });

  // Every action is a board verb; only card.move has a channel, because it is the only one the bridge
  // exposes. A screen that needs ship or review gets its channel in the same change.
  // action.test.ts pins both lists against what is served here.
  registerActions(main.table, [move]);
  return { reviews, actions: [move, ship, review] };
}
