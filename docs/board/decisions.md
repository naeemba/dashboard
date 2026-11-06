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
saying why. A command is as deliberate as a keystroke, so now every move into
Ship, from the board in either direction or from the command, goes through
card.move and ships (actions-decision-1). What it costs: moving a card left out
of Review into Ship ships it again, where it used to just sit there; a card
whose agent still works is refused, as a second ship always was.
