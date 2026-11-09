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

**`d` on a card in Done deletes it after the confirm, rather than cancelling
it.** Moving a merged card to Cancelled by key is the stray keystroke
board-decision-3 stops; a card a stray `d` cancelled would also drop out of the
release notes' What's new. Refusing `d` there instead left no key that removes a
Done card, a duplicate say, and every action must be reachable by key
(conventions-rule-1). The confirm catches a stray `d`, so nothing moves or goes
unasked. Drag a Done card to Cancelled to keep it as cancelled.

**A cancelled card does not wait for review, wherever Cancelled sits.**
`awaitsReview` answers false for it by name, so a board that already had a
Cancelled column in front of Review does not pull the card back into Review. The
sweep leaves a cancelled card's worktree alone, unlike a Done card's: the card
may be taken back up, and the worktree dialog removes it when it will not.

**Finished is decided by name, not position.** `isFinishedColumn` counts Done
and Cancelled; the subtask bar used to count the last column, so that renaming a
column did not change it. With two finished columns, last no longer says
finished, so a board whose finished column has another name (`Shipped`) shows
its subtasks as under way. That is the price of one rule the bar, the manager's
counts and its stalled panes all share.

## board-decision-6: A card's column follows its pull request, and the app says so

**The app moves a shipped card: into Doing when its agent starts, into Review
when its pull request opens, into Done when it merges, back to Doing when it
closes unmerged; and writes one line on the card for each.** Before, agents were
told when to move a card, by two instructions that disagreed: the global one said
Done once the pull request was ready, board-rule-2 said Review, then Done after
the merge. Agents moved cards to Done on main before the merge, and kamandsystem
#19 then failed to merge while main said Done. Now no instruction has to say it.
This supersedes board-rule-2's ordering: the rule (Review while open, Done after
the merge) stands, and the app keeps it. Folds in card b0234b28's lookup (the
number found from the branch through `gh`); its glyph of check and review state
is not part of this.

**Each state moves the card when it differs from the last line about that pull
request, and the line on the card is the record of that.** A reopen counts as a
new open: a pull request closed and reopened was left in Doing with nothing to
send it back. Following the state every tick would undo a
person: a card dragged back to Doing for a fix while its pull request stays open
would jump to Review two minutes later. The one exception is Done with a pull
request open, which is moved back every time, since that card is the bug above.

**Asked when a worker reports, when the board is shown, and every two minutes;
never twice in 30 seconds.** Showing the board re-reads it after each write, the
app's own included, and asking `gh` on each read would be a call per card per
keystroke. A Done card is asked about for a day after it last changed, enough to
catch an early Done and few enough that the first run does not ask about every
card ever finished. What it costs: one `gh` call per card in flight per check,
and a merged pull request reaches Done up to two minutes after the merge when
nobody reports and nobody looks.

**`gh` failing is silence, not a state.** Missing, logged out or offline, nothing
moves and nothing is written, and the log says so once per project until a check
goes through. A card with no branch is never asked about.

## board-decision-5: The board command keeps a git-tracked board in step with origin itself

**Every write to a board git tracks lands on origin's default branch, from the
screen or the command, from the project or a worktree, and the project's
checkout is fast-forwarded to it when nothing but the board is in the way.**
Before, nothing did: the global instructions had agents push board commits from
temporary worktrees, nothing ever brought the project's checkout up, and a later
`board move` there wrote cards from a copy 19-32 commits old. On kamandsystem,
2026-11-09, that put cards 6f33a3ad, 8564d0c6 and aebb87c7 back without their
Done, branch, pull request and comments, and once (78442317) the stale copy was
the truer one: Review with a merge-refused comment while origin said Done for a
pull request still open.

**What goes up is origin's board with the edit replayed onto it, never a copy
written whole.** The checkout's uncommitted board is replayed as the difference
from its HEAD, so a stale card it never touched stays as origin has it. Where
both sides changed one card, the newer `updatedAt` wins each field and the
trails are unioned (`rebaseBoardChange`, which the screen's save shares). The
union is what makes a replay safe to repeat: counting comments from the base
instead would add a pushed comment again every sync until the checkout caught up.

**The commit is made with a scratch index and work tree of origin's tip, not a
`git worktree`.** It is the temporary worktree the card asked for in every way
that matters (only the board's files, the checkout untouched) without a full
checkout per write, and a program killed half way leaves a folder in the temp
folder rather than a worktree record that blocks the next `git worktree add`.

**The screen does not wait.** A sync is a fetch and a push, seconds on a slow
network, and the board answers every keystroke; the write is on disk first and
syncs behind it. The fast-forward is synchronous so that no save lands between
putting the board's files back to HEAD and laying the checkout's edits over the
new tip. A `board` command in another process can still land there; the same
read-then-write ceiling `runBoardCommandOnLatest` names.

**What it costs.** A commit on main per save. A fetch per `board` command, reads
included, about a second. A repository whose main refuses pushes keeps its
board in the checkout, uncommitted, with a warning; before this the review
landed Done through the branch, and now it lands it in the checkout only. And a
ship still commits its Ship move on the new branch when origin did not have it
yet; card.move waits for the sync before the ship so that origin has it, which
leaves that commit empty and skipped.

## board-decision-7: A card with a pull request open sits in Review, and the app keeps it there


**A card with a pull request open sits in `Review`, not `Done`, and the app
puts it there** (board-decision-6). A column on `main` says what has been
merged; `Review` is the exception — a pull request open and nothing has checked
it. Otherwise the board says a feature is finished and checked while nobody has
looked at it, and `Review` sits empty in front of the person whose job it is to
look. This was board-rule-2, a line in `CLAUDE.md` that beat a global
instruction to move a card to Done once its pull request was ready; since the
app moves the card from the pull request's state, neither instruction is
anyone's to remember, and both are gone (board-decision-8). What follows is why
the order matters.

**The move into `Done` comes after the merge, and is one `board move`.** The
`board` command writes a board git tracks on origin's main itself, and brings
the project's checkout up to it (board-decision-5), from the project or from a
card's worktree alike. So a card moved to Done before the merge is main saying
Done for a pull request that may still be refused: kamandsystem #19 sat in Done
unmerged exactly like that.

What this replaced: the move went on the branch first, so the merge would carry
it into main, then the app's board was moved after. A branch-only Done was the
only way to get Done onto main when nothing but a merge wrote main, and the
order mattered: moved after the merge, main went on committing `Review` for a
feature that shipped weeks ago, while the only copy saying `Done` was an
uncommitted change in one person's checkout. With the command writing main,
the branch's board carries nothing about the card, and the order is merge, then
move. `reviewPrompt` in `review.ts` is where it is written down, and
`review.test.ts` pins it.

## board-decision-8: The board is kept by a hook and the app's own instructions, not CLAUDE.md

**An agent cannot hand-edit the board: a PreToolUse hook refuses an Edit, Write
or NotebookEdit of a file under `.dashboard/board/` (or the older
`.dashboard/board.json`), and a shell command that redirects, tees or `sed -i`s
into one, with a message naming the board command.** Before, a line in the
global `CLAUDE.md` said to use the command and never edit the JSON; an agent
that forgot wrote a card missing a field, and the app repaired it silently on
the next read (board-rule-1). A hook holds whatever the agent read. A board
file read, or put back from git (`git checkout origin/main -- .dashboard/`, how
a conflict on the board is resolved), goes through. An `mv` of a temporary file
over a card, a script, or an editor in a pane still does: matching those means
parsing the shell, and the guard is a guard rail, not a sandbox.

**One decision, three doors.** `board-guard.ts` decides from the tool's name
and input, with the test. Every Claude the app starts runs it as `node
"$DASHBOARD_BOARD" guard`: a terminal worker from its `--settings`, a Claude
screen (main's and a worker's, hosted or not) from the session's settings. A
command hook rather than an SDK callback because a hosted screen's hooks are
told to the app, never asked, so a callback could not refuse anything there.

**A Claude the app did not start gets it from `~/.claude/settings.json`.** At
each launch the installed app copies its board program to
`~/.claude/dashboard/board.js` and adds one PreToolUse entry running `node
"$HOME/.claude/dashboard/board.js" guard`, only when no entry already runs that
command. Nothing else in the file is rewritten: every other key and hook stays
as it was, the file keeps its mode, a linked `settings.json` stays a link and
the entry lands in the file it points at, and a file that is not JSON, or whose
hooks are not the shape Claude Code reads, is refused with one warning in the
log and left alone. `$HOME` rather than an absolute path, so a settings file
shared between machines through a dotfiles repo needs one entry, not one per
machine. What it costs: removing the entry by hand is undone at the next
launch; keep it out by keeping the app from launching, or delete the hook's
command file, which turns the entry into a non-blocking error.

**What an agent has to know is in the instructions the app gives it.**
`BOARD_INSTRUCTIONS` in `dispatch.ts` is appended to the system prompt of main
and of every worker, terminal or screen, resumed or not: the command exists and
prints its usage, a hand edit is refused, `board comment` records a finding
where `board set --notes` would replace the description, and the app moves a
card with a branch from its pull request, so an agent moves none and records no
pull request. The global `CLAUDE.md` section that said all this, and this
repo's board-rule-2, are deleted.

**An agent records no pull request: the review starts from the one the app
found.** The sweep that hands a finished card to a reviewer used to learn the
agent was done only from the number it wrote on its worktree's board. It now
also takes the number card.follow wrote on the project's board, while the card
sits in Review (`followedPullRequest` in `review.ts`). Not from another column:
a card sent back to Doing when its pull request closed unmerged keeps that
number, and a fresh ship of it has opened nothing yet. What it costs: the
review starts when card.follow next asks `gh`, up to two minutes after the pull
request opens, rather than the moment an agent writes the number.
