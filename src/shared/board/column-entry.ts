import { isColumnNamed, REVIEW_COLUMN, SHIP_COLUMN } from './board';

// What moved a card. `user` is a gesture on the board, `command` is `dashboard board move`, and
// `automatic` is the app itself: the review sweep moving a shipped card into Review once its pull
// request appears. A card file edited by anything else — an agent writing its worktree's board — is
// not a move request at all and never reaches this table.
export type MoveSource = 'user' | 'command' | 'automatic';

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
  if (isColumnNamed(column, SHIP_COLUMN)) return 'ship';
  // A card that reached Review on its own waits there when the loop is off; one sent there by a
  // person always starts it, which is how a user with the setting off starts a loop by hand.
  if (isColumnNamed(column, REVIEW_COLUMN)) return source !== 'automatic' || autoLoop ? 'review' : 'nothing';
  return 'nothing';
}
