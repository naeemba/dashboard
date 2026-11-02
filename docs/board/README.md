# Board

A project's kanban board under Ctrl+B, kept in `.dashboard/board.json`: cards
with priority, notes, subtasks, a comment trail, a branch and a pull request,
in Backlog, Todo, Ship, Doing, Review and Done. The `board` command writes the
same file, so an agent can work its own card.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

A kanban board kept in .dashboard/board.json inside the project. Every change is
written straight to disk, so there is no save key and undo is the only way back.
The file is re-read each time you enter the board, and again while you are
looking at it if something else writes it — an agent running the board command,
or a hand edit — with your selection left on the card it was on and a box you
have open left open on that card, still holding what you have typed. If the
write took the card away, the box closes rather than moving your text onto its
neighbour. A card you have open follows the write too: its subtasks redraw as
they land, a subtask you are half-way through naming keeps what you have typed,
and the card closes if the write took it away.

A card can be a subtask of another card: it stays an ordinary card in whatever
column you put it in, shows a badge naming its parent, and counts towards the
bar on that parent. A card also carries the branch and pull request its work is
on, which you type in, and the dates it was written and last changed, which the
app keeps for you and shows when you open the card.

A card also keeps a comment trail. The description is the one field you edit in
place; everything said about the card as the work goes on is appended to the
trail instead, so an agent recording what it found cannot take out what you
wrote. The card says how many there are, opening it reads them oldest first, and
c writes one — from the board or from the card.

Backlog is where a card waits until somebody picks it; Todo holds only what has
been picked. Every board gets Backlog in front of Todo, and the board command
puts a card there when it is not told a column.

There is a Ship column, just right of Todo. Moving a card into it — rightward
only — hands it to an agent: the app refuses if the project has anything
uncommitted outside .dashboard/, fetches and branches off the project's base
branch, makes a worktree in a folder beside the project, and starts an agent in
a worker that is sitting at a prompt with nothing running in it, or in a new
worker when none is. Main is never taken. A pane still standing in an earlier
card's worktree is taken last, since its transcript is still on screen.

Only what is in the foreground counts as running, and the pane it takes is
restarted in the worktree: a line you typed but never submitted goes with it,
and so does a job you put in the background — a pane where you ran npm run dev &
is a pane at a prompt as far as the ship can see. Leave a long job in the
foreground and the ship steps around it. That last part is unix only: on Windows
nothing about the foreground can be read, so a pane is held back only while an
agent is working in it and a job of yours in the foreground is taken like any
other.

Nothing you have written on this board is touched — the branch gets its own copy
of the file. The card goes back to where it was once the ship works, carrying a
line naming its branch and its pane — a column here says what has been merged,
not what is in flight, and the work stays on its own branch until the pull
request lands. It goes back to its own row, as it was, so a ship leaves this
board's file the way it found it and the next pull has nothing to trip over. A
card already in flight cannot be shipped again; its badge says where the first
one went.

There is a Review column as well, the one just before Done — placed by the
column it comes before rather than by a number, so a board with columns of your
own still gets it. It is the one column the app moves a card into by itself —
the one place a column here is not about what has merged. Once an agent has
written a pull request number onto its card and gone quiet — the number alone is
not enough, since it keeps working after it pushes that, and taking its folder
away mid-run would take the work with it — the card lands in Review, the
worktree the work was written in is thrown away, and a fresh one is cut from the
same branch in the same folder with a pane that reviews the pull request and
merges it. The badge reads reviewing while that runs, and the card reaches Done
when the pull request is merged.

Once it is in Done and no pane has a shell left in it — opened there, moved
there with cd, or running a program it started there — the worktree is removed
and the branch kept. An editor opened on a file in it from another folder does
not count, so save it before the last pane leaves. When the app cannot tell
where a shell is, because a network drive has stopped answering, the worktree
waits until it can. The review pane stays open until you close it, so you can
ask the agent about what it did; the worktree goes a few seconds after you do.
If git refuses, because something in it is uncommitted, the card says so and the
worktree waits for you on the worktree list. A card already past Review is never
reviewed again.

Moving a card into Review yourself does nothing: it is where the app puts
things, not a key. The card lands in Review either way, and carries a comment
when the worktree could not be swapped, since nothing was waiting on screen to
be told. Something left uncommitted in it is the one of those that mends itself:
git will not give up a worktree with a change in it, so the app asks again every
few seconds and the review starts on its own the moment that change is
committed. Every other reason is asked once and the comment is the end of it.

A board too long to read is searched rather than walked: / opens a box over it,
typing narrows the list to the cards whose titles match and then the cards with
the word written on them somewhere — in a description or in the trail, with the
line it was found on beside the title — and Enter puts the selection on the one
you picked, where every other key works as it always does. Opening it and typing
nothing is the whole board as one list. Picking a card the filter hides clears
the filter.

A board too messy to read is filtered instead: f opens a list of every field a
card has — words in its title, description, trail or branch; its priority;
whether it is a subtask or has them; whether it has a branch, a pull request or
comments; and when it was written or last changed. The arrows walk the list and
Left and Right change a field, and the board behind narrows as you choose. Cards
that do not match are hidden, each heading counts what is shown against what is
there, and a strip over the columns says what the filter is with a Reset button
beside it. A card you change so that it no longer matches stays until you move
off it, so the next key still acts on it, and the status bar says it is hidden.
The filter is gone when you leave the board. While one is on, the arrows walk
only the cards you can see and Shift with Up or Down swaps a card with the next
one shown.

Each column's heading has a sort button that sorts it by priority, urgent first,
as s does.

The mouse moves a card too: drag one to another column or to another row in its
own column and it does what Shift with an arrow does, the drop into Ship
included. A line along a card says where the one you are holding would land. A
click on a card moves the selection onto it and opens its title, which is what
Enter does there.

The manager has one of these too, and it is every open project's board at once,
one under the other, below a board of the manager's own. That first one is for
tasks that belong to no one project, and like the manager's notes it is kept in
a .dashboard folder in your home directory, out of every repository. It has no
Ship column, since there is no repository behind it to make a worktree in. The
same keys and the same writes — each board keeps its own undo — with two more
that say which board the rest of them are aimed at, and Escape to go back to the
manager's list.

Every pane also carries DASHBOARD_COMMAND, the path to a command whose board
words list cards and move them from a shell: run `node "$DASHBOARD_COMMAND"
board` in a project to see what it takes, or DASHBOARD_BOARD, the older path to
the same program, with no word in front. It is how an agent working a card moves
its own, and .dashboard/CLAUDE.md in each project spells it out.

## Files

Folders: `src/main/board/`, `src/shared/board/`, `src/renderer/board/`.

- Model and file: `board.ts`, `board-store.ts`, `board-watch.ts`,
  `board-writes.ts`, `board-changes.ts`, `card-moves.ts`
- The `board` command: `board-cli.ts`, `board-cli-entry.ts`, `board-program.ts`,
  `board-usage.ts` (also `dashboard board`, see [command](../command/README.md))
- Screen: `board-view.ts`, `board-detail.ts`, `board-toolbar.ts`,
  `board-state.ts`, `board-drag.ts`, `drop-marker.ts`, `card-aim.ts`
- Narrowing: `board-filter.ts`, `filter-dialog.ts`, `card-search.ts`
- Styles: `board.css`
- Tests: `test-board.ts` (helpers), `board.test.ts`, `board.columns.test.ts`,
  `board.tree.test.ts`

## Scenarios

- Given the board is on screen, when `board move` writes the file from a pane, then the board re-reads without moving your selection.
- Given a card with subtasks, when you blank its title, then it is refused and the status bar says to delete it with `d`.
- Given you deleted a card, when you undo, then it comes back where it was.
- Given the board's first read failed, when you press a key, then the board refuses it instead of writing over the file.
- Given a card's pull request is open, when its agent finishes, then the card goes in Review, not Done.
- Given a filter keeps a card only because you just changed it, when an arrow moves the selection off it, then the board redraws and the card is gone; an arrow that leaves the drawn cards as they are and lands on one of them only moves the highlight.
