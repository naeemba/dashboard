import { pullRequestLabel, selectionOf, type Board } from '../../../shared/board/board';
import type { CardMoveResult, Refused } from '../../../shared/app/bridge';
import { brokenFilesRefusal } from '../../board/board-cli';
import { followedBranch, followStep, type PullRequest } from '../../board/pull-request-column';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';
import type { CardMoveInput } from './move';

export type CardFollowPorts = {
  // The project's board, without salvage, as card.move reads it.
  read(projectPath: string): { board: Board; brokenFiles: string[] };
  // The branch on the card's worktree record, for a card shipped before a ship wrote it on the card.
  worktreeBranch(projectPath: string, id: string): string | undefined;
  // The branch's pull request, asked of the project's forge (branchPullRequest). Throws when it cannot answer.
  pullRequestOf(projectPath: string, branch: string): Promise<PullRequest | null>;
  // The card's number, branch and line, written and sent to origin behind it.
  write(projectPath: string, board: Board): void;
  // card.move, for the column: what entering it starts is its table's to say.
  move(input: CardMoveInput): Promise<CardMoveResult | Refused>;
  now(): number;
};

// `ran` is what the move started, absent when there was no move: a review start that asked for the
// follow knows from it when the move already started the review.
export type CardFollowAnswer = { output: string } & Partial<Pick<CardMoveResult, 'ran'>>;

// A card's column set from its pull request (board-decision-6): found from its branch through the
// project's forge (forge.ts), the number recorded, a line said when the state differs from the last
// one about that pull request, and the move made through card.move as the app's own.
// pull-request-column.ts holds every decision; this reads, asks and writes.
export const cardFollow = action<CardFollowPorts, CardInput, CardFollowAnswer>('card.follow', {
  words: ['id'],
  input: cardInput,
  async run(ports, { projectPath, id }) {
    const before = ports.read(projectPath);
    if (before.brokenFiles.length > 0) return { refused: brokenFilesRefusal(before.brokenFiles) };
    const at = selectionOf(before.board, id);
    if (at === null) return { refused: `no card with id ${id}` };
    const card = before.board.columns[at.column].cards[at.card];
    const branch = followedBranch(card, before.board.columns[at.column].name, ports.worktreeBranch(projectPath, id), ports.now());
    if (branch === undefined) {
      return { output: `"${card.title}" is not followed` };
    }
    const pull = await ports.pullRequestOf(projectPath, branch);
    // Read again: the forge takes seconds, and a move made meanwhile is the board this step lands on.
    const { board } = ports.read(projectPath);
    const step = followStep(board, id, branch, pull);
    if (step.board !== null) ports.write(projectPath, step.board);
    if (step.column === null) return { output: pull === null ? `${branch} has no pull request` : `"${card.title}" follows ${pullRequestLabel(pull.number)}` };
    const moved = await ports.move({ projectPath, id, column: step.column, source: 'automatic', askedFrom: null });
    return isRefused(moved) ? moved : { output: moved.output, ran: moved.ran };
  },
});
