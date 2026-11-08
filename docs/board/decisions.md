# Board: decisions

Settled questions. Read the entry before re-litigating it.

## board-decision-1: One file per card

**The board is `.dashboard/board/`: `columns.json` lists the columns in order,
and `cards/<id>.json` holds one card with its `column` and its `order`.**
`board.json` was in 82 of 115 conflicted merges (`docs/review/2026-11-01.md`
W1): every card branch rewrote the one file, so two branches each moving their
own card conflicted on it. Now adding a card adds a file and moving one rewrites
that card's file, so two branches adding different cards, or moving different
cards, merge with nobody asked. `board-files.test.ts` proves both with real git
merges.

**Card order is an `order` number on the card, not an index file.** An index
listing every card's place would change on every move, and two moves would
conflict on it the way `board.json` did. A move gives only the moved card a new
number, between its new neighbours; every card already in order keeps its own
(`card-order.ts` keeps the longest such run). Ties — two branches both adding at
the top — read back by id, the same on every machine. When a gap runs out (about
fifty inserts into one spot) or a card goes between two tied ones, the column is
renumbered 0, 1, 2…, which rewrites its cards once. **Column order is
`columns.json`**, which changes only when a column is added, renamed or moved;
an empty column survives because it is listed there.

**`board.json` is read forever and written never.** Every project the app has
opened keeps one until its board is next written. That write puts every card in
its own file first and removes `board.json` last, so a write that stops half
way leaves both, and a read of both is the folder plus any card only
`board.json` has, at the bottom of its column: no card is lost. The same rule
covers a branch still editing `board.json` merged into one that has moved on.
Committing a board uses `BOARD_PATHSPECS` with `git add -A`, so the move, the
old file's removal included, is one commit.

**What the move costs, once per project:** two branches that each make the
first write of the same `board.json`, in parallel, both add every card file;
the merge is clean for every card neither changed and an add/add conflict on a
card both changed. Moving main first — the app's own write of the board on
screen — is what avoids it. A branch cut before main moved that still edits
`board.json` meets main's removal of it as a modify/delete conflict, once.
Neither answer keeps the branch's edits to a card main already has: the read
takes the folder's copy of any card both hold, and the next write removes
`board.json` with those edits in it. Keeping the branch's `board.json` keeps
only the cards new on the branch; dropping it (`git rm .dashboard/board.json`)
keeps none of them. Either way, redo the branch's moves with the `board`
command — a card the branch moved to Review in `board.json` reads back in
whatever column main's folder has it.

## board-decision-2: A move into Ship ships whatever made it

**Replaces the rule that a move into Ship had to come from a gesture**, which
lived in `landsInShip` in `board.ts`: only Shift+Right or a drop shipped, never
a move to the left and never `board move <id> Ship`, so a key that sent a card
straight to a column could not start a worktree by mistake. That made the
command a second, silent set of rules: an agent or a person typing `dashboard
board move <id> Ship` wrote the card into Ship and nothing shipped, with nothing
saying why. A command is as deliberate as a keystroke, so now a move into Ship
from the command, a drop from either side or Shift+Right goes through card.move
and ships (actions-decision-1); so does a move into Review, which starts the
review loop, and so does Shift+Left. What it costs: walking a card from Doing
back to Todo ships it at the Ship step, and a card walked rightward through
Review starts its loop at that step. A card whose agent still works is refused,
as a second ship always was. A finished card cannot be walked back from Done by
key at all (board-decision-3).

## board-decision-3: A card in Done moves only by dragging it

**Shift with an arrow on a card in Done is refused with an error naming the
card; a drag still moves it.** A finished card is merged, so a keystroke on it
is more likely the highlight on the wrong card than a decision, and under
board-decision-2 walking it left would start a review at Review and ship it
again at Ship. Picking the card up with the mouse is deliberate enough to
allow. `keyboardMoveRefusal` in `done-lock.ts` decides it, with its test. The
command (`dashboard board move`) is not a keystroke on a highlight and is not
refused.

## board-decision-4: A card that will not be done is cancelled, not deleted

**`d` moves a card into Cancelled, the last column, and deletes only a card
already there.** Deleting threw away the card's notes, trail and the record that
the idea was had and turned down; the user would rather keep it. Cancelling
asks nothing, because it is a move undo takes back; the delete in Cancelled
keeps the confirm. `deleteKeyOutcome` in `card-delete.ts` decides it, with its
test. Only the card moves: its subtasks keep their columns, as on any move.

**A card leaves Cancelled like any column, by key or drag, unlike Done's lock
(board-decision-3).** Done's lock stops a stray Shift+Left on a merged card from
starting a review and a ship again. A cancelled card was never merged, and
taking one back up is a decision as ordinary as moving a card out of Backlog:
Shift+Left from Cancelled lands in Done, and walking on past Review and Ship
starts them, as board-decision-2 says of any card.

**`d` on a card in Done is refused, with Done's lock.** Moving a merged card to
Cancelled by key is the stray keystroke board-decision-3 stops; a card a stray
`d` cancelled would also drop out of the release notes' What's new. Drag it to
Cancelled to cancel it, then `d` there deletes it.

**A cancelled card does not wait for review, wherever Cancelled sits.**
`awaitsReview` answers false for it by name, so a board that already had a
Cancelled column in front of Review does not pull the card back into Review. The
sweep then removes its worktree as it does a Done card's.

**Finished is decided by name, not position.** `isFinishedColumn` counts Done
and Cancelled; the subtask bar used to count the last column, so that renaming a
column did not change it. With two finished columns, last no longer says
finished, so a board whose finished column has another name (`Shipped`) shows
its subtasks as under way. That is the price of one rule the bar, the manager's
counts and its stalled panes all share.
