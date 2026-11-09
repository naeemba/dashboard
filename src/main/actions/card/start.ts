import { columnNamed, DOING_COLUMN, moveCardById, selectionOf, setBranch, type Board } from '../../../shared/board/board';
import { brokenFilesRefusal } from '../../board/board-cli';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardStartInput = CardInput & { branch: string };

export type CardStartPorts = {
  read(projectPath: string): { board: Board; brokenFiles: string[] };
  // Written and sent to origin behind it, as the app's own move.
  write(projectPath: string, board: Board): void;
};

// The project's board with the card handed to an agent: its branch written when it has none, and the
// card in Doing unless it is already there or past it (a card in Review re-shipped for a fix stays in
// Review). Null when neither changes.
export function startedBoard(board: Board, id: string, branch: string): Board | null {
  const at = selectionOf(board, id);
  if (at === null) return null;
  let next = board.columns[at.column].cards[at.card].branch === undefined ? setBranch(board, at, branch).board : board;
  const doing = columnNamed(next, DOING_COLUMN);
  if (doing !== -1 && at.column < doing) next = moveCardById(next, id, doing) ?? next;
  return next === board ? null : next;
}

// A card whose agent the app has just started, by a ship or `pane run --card`: into Doing with its
// branch on it, so main's board says it is being worked without the agent being told to move it.
export const cardStart = action<CardStartPorts, CardStartInput, { output: string }>('card.start', {
  words: ['id', 'branch'],
  input(raw) {
    const card = cardInput(raw);
    if (isRefused(card)) return card;
    if (typeof raw.branch !== 'string' || raw.branch.trim() === '') return { refused: 'a started card needs its branch' };
    return { ...card, branch: raw.branch.trim() };
  },
  async run(ports, { projectPath, id, branch }) {
    const { board, brokenFiles } = ports.read(projectPath);
    if (brokenFiles.length > 0) return { refused: brokenFilesRefusal(brokenFiles) };
    const started = startedBoard(board, id, branch);
    if (started !== null) ports.write(projectPath, started);
    return { output: started === null ? `card ${id} is already under way` : `card ${id} is in Doing on ${branch}` };
  },
});
