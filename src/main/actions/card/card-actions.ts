import type { Channels } from '../../app/channels';
import type { Refused, WorktreeEntry } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import { shipEntry } from '../../../shared/app/log-entry';
import { REVIEW_COLUMN, type Board } from '../../../shared/board/board';
import type { BoardChanges } from '../../board/board-changes';
import type { BoardSyncQueue } from '../../board/board-sync-queue';
import { readBoard, writeBoard } from '../../board/board-store';
import { homedir } from 'node:os';
import { realPath } from '../../app/real-path';
import { bumpsVersion, landsPullRequest, readProjectsFile } from '../../projects/projects-file';
import { isProjectBoard } from './project-board';
import { isLinkedWorktree } from '../../board/linked-worktree';
import { runProgram } from '../../app/git';
import { projectForge } from '../../app/forge';
import { reviewFinished } from '../../ship/review-finished';
import { reviewSweep, type ReviewPorts, type ReviewSweep } from '../../ship/review-flow';
import { CLAUDE_FOLDER, loopWorkflow, reviewLoopMissing } from '../../ship/review-loop-install';
import { entryForCard } from '../../ship/worktree-store';
import { followedBranch, type PullRequest } from '../../board/pull-request-column';
import { pullRequestSweep, type PullRequestSweep } from '../../board/pull-request-sweep';
import { shipFlow, type ShipPorts } from '../../ship/ship-flow';
import { notOpenRefusal } from '../../ship/ship';
import type { QueueEntry } from '../../workers/pane-pool';
import { bind, registerActions, type BoundAction } from '../action';
import { cardFollow } from './follow';
import { cardMove } from './move';
import { cardReview } from './review';
import { cardShip } from './ship';
import { cardStart } from './start';

// What only main.ts holds, handed over once. Main-process wiring (workflow-rule-2's exemption): every
// decision is in the actions, ship-flow.ts and review-flow.ts.
export type CardActionsMain = Omit<ShipPorts, 'forgetReview' | 'bumpsVersion'>
  & Omit<ReviewPorts, 'worktrees' | 'queue' | 'writeBoard' | 'arrived' | 'landsPullRequest' | 'reviewFinished' | 'forgeOf' | 'loopMissing' | 'workflow' | 'follow'> & {
    table: Channels;
    boardLog: BoardChanges;
    // Every board write here goes to origin behind it (board-sync-queue.ts).
    boardSync: BoardSyncQueue;
    // settings.review.autoLoop, read at each move so a change on the settings screen holds at once.
    autoLoop(): boolean;
    // settings.review.autoMerge, the same way; a project's entry in projects.yaml wins over it.
    autoMerge(): boolean;
    log(draft: LogDraft): void;
    // The branch's pull request, asked of the project's forge (branchPullRequest in merge-request.ts).
    pullRequestOf(projectPath: string, branch: string): Promise<PullRequest | null>;
    // pane.start (actions/pane/queue.ts): a ship's or a review's start, now or once a worker slot frees.
    startWork(raw: Record<string, unknown>): Promise<{ output: string } | Refused>;
  };

export type CardActions = {
  reviews: ReviewSweep;
  // Every card's column set from its pull request: the app's to run, so no verb of the command.
  pullRequests: PullRequestSweep;
  // card.start, for main's one place a card's agent is given its pane.
  start: BoundAction;
  actions: BoundAction[];
  // A queued ship or review started, as the pane pool starts it: the ship itself, or the review's swap.
  begin(entry: QueueEntry): Promise<{ output: string } | Refused>;
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
  // The app's own writes, logged so the watcher does not take them for the command's.
  const writeShown = (projectPath: string, board: Board) => writeAndSync(projectPath, board, true);
  // Without salvage: a write follows, and a card file that does not parse is refused (readBoard).
  const read = (projectPath: string) => readBoard(projectPath, false);
  const projectBoard = (projectPath: string) =>
    isProjectBoard(projectPath, main.worktrees().map((entry) => entry.worktreePath), realPath, isLinkedWorktree);

  const reviews: ReviewSweep = reviewSweep({
    ...main,
    writeBoard: writeShown,
    arrived: (entry: WorktreeEntry) => move.call({ projectPath: entry.projectPath, id: entry.cardId, column: REVIEW_COLUMN, source: 'automatic' }),
    landsPullRequest: (projectPath) => landsPullRequest(() => readProjectsFile().text, projectPath, homedir(), realPath, main.autoMerge()),
    reviewFinished: (projectPath, pullRequest) => reviewFinished(runProgram, projectPath, pullRequest, 20_000),
    forgeOf: (projectPath) => projectForge(projectPath, runProgram),
    loopMissing: () => reviewLoopMissing(CLAUDE_FOLDER),
    workflow: loopWorkflow(CLAUDE_FOLDER),
    follow: (projectPath, id) => follow.call({ projectPath, id }),
  });
  const shipCard = shipFlow({
    ...main,
    forgetReview: (cardId) => reviews.forget(cardId),
    bumpsVersion: (projectPath) => bumpsVersion(readProjectsFile().text, projectPath, homedir(), realPath),
  });

  const move = bind(cardMove, {
    read,
    // A move from the command is written plainly, so the watcher logs it as the command's, as it did
    // when the command wrote the file itself.
    write: (projectPath, board, source) => writeAndSync(projectPath, board, source === 'automatic'),
    published,
    projectBoard,
    autoLoop: main.autoLoop,
    ship: (input) => ship.call(input),
    review: (input) => review.call(input),
  });
  // Both start through the pane pool, which calls `begin` below when a slot is free.
  const ship = bind(cardShip, {
    read: (projectPath) => read(projectPath).board,
    slotOf: main.slotOf,
    ship: ({ projectPath, id, title, first, after }) => main.startWork({ dispatcherPath: projectPath, projectPath, cardId: id, after, first, work: { kind: 'ship', title } }),
  });
  const review = bind(cardReview, {
    review: ({ projectPath, id }) => main.startWork({ dispatcherPath: projectPath, projectPath, cardId: id, after: null, first: false, work: { kind: 'review' } }),
  });
  async function begin({ projectPath, cardId, work }: QueueEntry): Promise<{ output: string } | Refused> {
    if (cardId === null || work.kind === 'run') return { refused: 'not a card\'s start' };
    if (work.kind === 'review') return reviews.review(cardId);
    // The page it is on now: a project closed and opened again since it was queued has a new one.
    const slot = main.slotOf(projectPath);
    if (slot === -1) return { refused: notOpenRefusal(work.title) };
    const request = { projectPath, cardId, title: work.title, slot };
    const result = await shipCard(request);
    main.log(shipEntry(request, result));
    return result.ok ? { output: `"${work.title}" shipped on ${result.entry.branch}` } : { refused: result.message };
  }
  const start = bind(cardStart, { read, write: writeShown });
  const worktreeBranch = (projectPath: string, id: string) => {
    const entry = entryForCard(main.worktrees(), id);
    return entry?.projectPath === projectPath ? entry.branch : undefined;
  };
  const follow = bind(cardFollow, {
    read,
    worktreeBranch,
    pullRequestOf: main.pullRequestOf,
    write: writeShown,
    move: (input) => move.call(input),
    now: Date.now,
  });
  const pullRequests = pullRequestSweep({
    projectBoard,
    followed(projectPath) {
      const { board } = read(projectPath);
      return board.columns.flatMap((column) => column.cards
        .filter((card) => followedBranch(card, column.name, worktreeBranch(projectPath, card.id), Date.now()) !== undefined)
        .map((card) => card.id));
    },
    // A refusal is a card the board no longer has, or a file that does not parse: the card is left
    // alone and the next check asks again. Only the forge's failure throws.
    follow: (projectPath, id) => follow.call({ projectPath, id }),
    warn: (project, message) => main.log({ level: 'warn', kind: 'board', project, message }),
    now: Date.now,
  });

  // Every action is a board verb; only card.move has a channel, because it is the only one the bridge
  // exposes. A screen that needs ship or review gets its channel in the same change.
  // action.test.ts pins both lists against what is served here.
  registerActions(main.table, [move]);
  return { reviews, pullRequests, start, actions: [move, ship, review], begin };
}
