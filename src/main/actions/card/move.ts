import { columnNamed, type Board } from '../../../shared/board/board';
import { columnEntry, type ColumnEntry, type MoveSource } from '../../../shared/board/column-entry';
import type { Refused } from '../../../shared/app/bridge';
import { brokenFilesRefusal, runBoardCommand } from '../../board/board-cli';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardMoveInput = CardInput & { column: string; source: MoveSource };
// `started` is what the entry's action answered, empty when it ran none.
export type CardMoveResult = { output: string; ran: ColumnEntry; started: string };

export type CardMovePorts = {
  // The project's board, without salvage: a move is committed, so a card file that does not parse is
  // refused rather than set aside (readBoard says why).
  read(projectPath: string): { board: Board; brokenFiles: string[] };
  // `source` says whose write it is, for the move log: the sweep's own moves are not the command's.
  write(projectPath: string, board: Board, source: MoveSource): void;
  // Whether the folder is a project's own board, not a worktree's or the manager's.
  projectBoard(projectPath: string): boolean;
  autoLoop(): boolean;
  ship(input: CardInput): Promise<{ output: string } | Refused>;
  review(input: CardInput): Promise<{ output: string } | Refused>;
};

const SOURCES: readonly string[] = ['user', 'command', 'automatic'];

// Every move of a card between columns, from the board, `dashboard board move` and the review sweep:
// the move written, then whatever column-entry.ts says entering that column starts.
//
// A move into the column the card is already in writes nothing and still runs the entry. That is the
// screen's case — it has written its own move already and asks for the rest — and it is how a ship that
// stopped part way is picked up again, or a review loop started for a card waiting in Review.
export const cardMove = action<CardMovePorts, CardMoveInput, CardMoveResult>('card.move', {
  words: ['id', 'column'],
  input(raw) {
    const card = cardInput(raw);
    if (isRefused(card)) return card;
    const { column, source } = raw;
    if (typeof column !== 'string' || column.trim() === '') return { refused: 'move needs a card id and a column' };
    if (typeof source !== 'string' || !SOURCES.includes(source)) return { refused: 'a move needs a source' };
    return { ...card, column, source: source as MoveSource };
  },
  async run(ports, { projectPath, id, column, source }) {
    const { board, brokenFiles } = ports.read(projectPath);
    if (brokenFiles.length > 0) return { refused: brokenFilesRefusal(brokenFiles) };
    const moved = runBoardCommand(board, ['move', id, column]);
    if (!moved.ok) return { refused: moved.message };
    if (moved.board !== null) ports.write(projectPath, moved.board, source);
    const entry = columnEntry({
      column: board.columns[columnNamed(board, column)].name,
      source,
      autoLoop: ports.autoLoop(),
      projectBoard: ports.projectBoard(projectPath),
    });
    if (entry === 'nothing') return { output: moved.output, ran: entry, started: '' };
    const started = await (entry === 'ship' ? ports.ship : ports.review)({ projectPath, id });
    // The move stays written: a card refused a ship or a review is still where it was put, and the
    // refusal says why nothing started there.
    if (isRefused(started)) return { refused: `${moved.output}; ${started.refused}` };
    return { output: `${moved.output}\n${started.output}`, ran: entry, started: started.output };
  },
});
