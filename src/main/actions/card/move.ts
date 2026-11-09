import { columnNamed, selectionOf, type Board } from '../../../shared/board/board';
import { columnEntry, isMoveSource, type MoveSource } from '../../../shared/board/column-entry';
import type { CardMoveResult, Refused } from '../../../shared/app/bridge';
import { brokenFilesRefusal, runBoardCommand } from '../../board/board-cli';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardMoveInput = CardInput & { column: string; source: MoveSource };

export type CardMovePorts = {
  // The project's board, without salvage: a move is committed, so a card file that does not parse is
  // refused rather than set aside (readBoard says why).
  read(projectPath: string): { board: Board; brokenFiles: string[] };
  // `source` says whose write it is, for the move log: the sweep's own moves are not the command's.
  // The write goes to origin behind it, through the board's git sync.
  write(projectPath: string, board: Board, source: MoveSource): void;
  // Settles once every board write to the project so far is on origin, or could not be.
  published(projectPath: string): Promise<void>;
  // Whether the folder is a project's own board, not a worktree's or the manager's.
  projectBoard(projectPath: string): boolean;
  autoLoop(): boolean;
  ship(input: CardInput): Promise<{ output: string } | Refused>;
  review(input: CardInput): Promise<{ output: string } | Refused>;
};

// Every move of a card between columns, from the board, `dashboard board move` and the review sweep:
// the move written, then whatever column-entry.ts says entering that column starts.
//
// A move into the column the card is already in writes nothing and still runs the entry. That is the
// screen's case — it has written its own move already and asks for the rest — and it is how a ship that
// stopped part way is picked up again, or a review loop started for a card waiting in Review.
//
// So the screen's move is never made here. A card the screen asks about that is no longer in that
// column was moved on by a later keystroke whose save landed first, and moving it back would undo
// that keystroke and start a ship or a review for a column the person has left.
export const cardMove = action<CardMovePorts, CardMoveInput, CardMoveResult>('card.move', {
  words: ['id', 'column'],
  input(raw) {
    const card = cardInput(raw);
    if (isRefused(card)) return card;
    const { column, source } = raw;
    if (typeof column !== 'string' || column.trim() === '') return { refused: 'move needs a card id and a column' };
    if (!isMoveSource(source)) return { refused: 'a move needs a source' };
    return { ...card, column, source };
  },
  async run(ports, { projectPath, id, column, source }) {
    const { board, brokenFiles } = ports.read(projectPath);
    if (brokenFiles.length > 0) return { refused: brokenFilesRefusal(brokenFiles) };
    if (source === 'user' && movedOn(board, id, column)) return { output: `card ${id} has moved on from ${column}`, ran: 'nothing', started: '' };
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
    // A ship cuts its branch off origin, so the Ship move is on origin first, the screen's own save of it
    // included: a branch cut before it carries a Ship move of its own, and that card's file then
    // conflicts with main's at the merge.
    await ports.published(projectPath);
    const started = await (entry === 'ship' ? ports.ship : ports.review)({ projectPath, id });
    // The move stays written: a card refused a ship or a review is still where it was put, and the
    // refusal says why nothing started there.
    if (isRefused(started)) return { refused: `${moved.output}; ${started.refused}` };
    return { output: `${moved.output}\n${started.output}`, ran: entry, started: started.output };
  },
});

// A card on the board that is not in the named column. An unknown card or column is not this:
// runBoardCommand refuses those with its own words.
function movedOn(board: Board, id: string, column: string): boolean {
  const at = selectionOf(board, id);
  const named = columnNamed(board, column);
  return at !== null && named !== -1 && at.column !== named;
}
