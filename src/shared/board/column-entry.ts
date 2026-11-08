import { CANCELLED_COLUMN, isColumnNamed, REVIEW_COLUMN, SHIP_COLUMN } from './board';
import { isManagerPath } from '../manager/manager';

// What moved a card. `user` is a gesture on the board, `command` is `dashboard board move`, and
// `automatic` is the app itself: the review sweep moving a shipped card into Review once its pull
// request appears. A card file edited by anything else — an agent writing its worktree's board — is
// not a move request at all and never reaches this table.
export const MOVE_SOURCES = ['user', 'command', 'automatic'] as const;
export type MoveSource = (typeof MOVE_SOURCES)[number];

export function isMoveSource(value: unknown): value is MoveSource {
  return MOVE_SOURCES.some((source) => source === value);
}

// The action entering a column starts, or nothing.
export type ColumnEntry = 'ship' | 'review' | 'nothing';

export type Entering = {
  // The column the card is now in, as the board spells it; matched the way columnNamed matches.
  column: string;
  source: MoveSource;
  // settings.review.autoLoop: whether a card that reaches Review on its own starts its review loop.
  autoLoop: boolean;
  // Whether the board is a project's own. A worktree's board is its agent's working copy and the
  // manager's has no repository behind it, so entering a column there means nothing.
  projectBoard: boolean;
};

// The one table of what a move means (actions-decision-1). Every move, from the screen, the command or
// the sweep, asks it, so a column cannot mean one thing to a drag and another to `board move`.
export function columnEntry({ column, source, autoLoop, projectBoard }: Entering): ColumnEntry {
  if (!projectBoard) return 'nothing';
  // A cancelled card is kept, not worked: entering Cancelled starts nothing, and a worktree the card
  // has stays until the worktree dialog removes it (board-decision-4).
  if (isColumnNamed(column, CANCELLED_COLUMN)) return 'nothing';
  if (isColumnNamed(column, SHIP_COLUMN)) return 'ship';
  // A card that reached Review on its own waits there when the loop is off; one sent there by a
  // person always starts it, which is how a user with the setting off starts a loop by hand.
  if (isColumnNamed(column, REVIEW_COLUMN)) return source !== 'automatic' || autoLoop ? 'review' : 'nothing';
  return 'nothing';
}

// What the screen asks main about once its own move is saved, 'nothing' for a move it asks nothing
// about. A card that stayed in its column has entered nothing: reordered inside Ship, or pushed against
// the edge of a board with Ship last. Any move into another column asks, in either direction, as the
// agreed design has it (board-decision-2). The manager's board has no repository behind it.
export function screenMoveEntry(
  projectPath: string, column: string, from: number, to: number,
): ColumnEntry {
  if (from === to) return 'nothing';
  return columnEntry({ column, source: 'user', autoLoop: true, projectBoard: !isManagerPath(projectPath) });
}
