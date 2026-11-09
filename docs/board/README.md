# Board

A project's kanban board under Ctrl+B, kept in `.dashboard/board/`, one file per
card: cards with priority, notes, subtasks, a comment trail, a branch and a pull
request, in Backlog, Todo, Ship, Doing, Review, Done and Cancelled. The `board` command
writes the same files, so an agent can work its own card. A project the app has
not written to since still keeps `.dashboard/board.json`; it is read as it is,
and the next write moves it into the folder (board-decision-1).

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

A kanban board kept in .dashboard/board inside the project, a file per card. Every change is
written straight to disk, so there is no save key and undo is the only way back.
A write carries only what you changed, laid over the file as it is at that
moment, so a card an agent moved a second ago stays where the agent put it.
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

A card that will not be done is kept, in Cancelled, the last column, which every
board gets on read the way it gets Backlog. `d` on a card moves it there, a move
like any other that undo takes back; only `d` on a card already in Cancelled
deletes it, with its subtasks, after the confirm. Its subtasks stay where they
are. Entering Cancelled starts nothing, from the board or from `board move <id>
Cancelled`, and a card leaves it like any column, by key too (board-decision-4).
A cancelled card is never pulled into Review, and its worktree stays, even once
its agent has opened a pull request, until the worktree dialog removes it. `d` on a card in Done asks and then deletes
it, since no key moves a card out of Done. Whatever
treats Done as finished treats Cancelled the same: the manager's column counts
leave both out, the subtask bar counts both as finished, a pane working a
cancelled card is not stalled, and the release notes' What's new lists only Done.

There is a Ship column, just right of Todo. Moving a card into it — Shift
with either arrow, a drop from either side, or `dashboard board move <id>
Ship` — hands it to an agent, and `dashboard board ship <id>` does the same
without the move. A card in Done moves only by dragging it: Shift with an
arrow on it is refused with an error naming the card, since the highlight may
be on the wrong one (board-decision-3). The app refuses if the project has
anything uncommitted
outside .dashboard/, fetches and branches off the project's base branch, makes a
worktree in a folder beside the project, and starts an agent in a worker
that is sitting at a prompt with nothing running in it, or in a new worker
when none is. The agent is a Claude screen in that pane, as a worker main
dispatches is, except on Windows, where it is Claude Code in the terminal; the
review pane below is the same (workers-decision-8). Main is never taken. A pane still standing in an earlier card's
worktree is taken last, since its transcript is still on screen.

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

With the settings screen's Review row off (`review.autoLoop` in settings.json),
a card whose pull request opens is moved into Review and waits there. Moving
a card into Review yourself, with Shift and an arrow, a drop or `dashboard
board move <id> Review`, starts its review loop whatever the setting, and so
does `dashboard board review <id>`; a card with no worktree, no pull request
yet, an agent still working, a card gone from the board, or a card already
past Review is refused, and the status bar or the command says why. What
entering a column starts is one table for the board, the command and the app
(docs/actions). The card lands in Review either way, and carries a comment when
the worktree could not be swapped, since nothing was waiting on screen to be
told. Something left uncommitted in it is the one of those that mends itself:
git will not give up a worktree with a change in it, so the app asks again
every few seconds and the review starts on its own the moment that change
is committed. Every other reason is asked once and the comment is the end of it.

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

## Kept in step with git

A board git tracks is the default branch's, wherever it is written from
(board-decision-5). Every write, from the screen, card.move, the review sweep
or the `board` command, goes through `syncBoard` in `board-sync-git.ts`:

1. fetch origin's default branch (10 seconds at most);
2. read origin's board there, with the checkout's own uncommitted board edits
   replayed onto it (`rebaseBoardChange`), then the command's edit on top;
3. commit that, and only the board's files, onto origin's tip with a plain
   message (`board: "Fix login" Doing → Review`), and push it; a push that lost
   a race fetches and tries again, three tries in all;
4. bring the project's checkout up to it: on the default branch, only behind,
   and nothing changed outside `.dashboard/`, the board's files are put back to
   HEAD, the checkout fast-forwarded (no stash, hooks off), and its own board
   edits laid back on top. Otherwise it is left where it is, and the `board`
   command writes its edit there as well.

The commit is made in a scratch folder in the system temp folder holding only
origin's board files and an index of its own, so the checkout's branch, HEAD,
index and working tree are never touched by it and nothing is left registered
with `git worktree`. Run in a card's worktree or a throwaway one, the command
works on main the same way and leaves the worktree's board, which is its
branch's, alone: no board change rides in a feature branch. `board list` and
`board show` read the same fresh board, so a move made in a worktree reads back.

A card both sides changed is merged field by field: comments are the union of
both trails, one comment being one (at, body), and every other field, the column
included, goes to the side whose card has the newer `updatedAt`.

The screen never waits on the network: the save is on disk at once, and
`board-sync-queue.ts` runs one sync per project behind it, a burst of saves
folded into one more. card.move waits for its write to be on origin before a
ship cuts a branch. Offline, with no `origin`, or with a push refused for any
other reason, the board is written where it is as before, and the app logs one
warning per project (`board` kind) until a sync goes through; the command prints
it on each run. A board git does not track, and the manager's, are untouched.

## Files

Folders: `src/main/board/`, `src/shared/board/`, `src/renderer/board/`.

- Model and file: `board.ts`, `board-store.ts`, `board-files.ts` (where the
  folder's bytes go), `card-order.ts` (a card's place in its column), `board-watch.ts`,
  `board-writes.ts`, `board-changes.ts`, `card-moves.ts`, `board-merge.ts` (an app save replayed
  onto the file as it is now)
- The git sync: `board-sync.ts` (its decisions), `board-sync-git.ts` (the git),
  `board-sync-queue.ts` (the app's one sync per project), each beside its `.test.ts`
- The `board` command: `board-cli.ts`, `board-cli-entry.ts`, `board-program.ts`,
  `board-usage.ts`, `board-target.ts` (which project, `--project`), `linked-worktree.ts` (a worktree's board, where a move asks the app nothing) (also `dashboard board`, see [command](../command/README.md))
- `/create-task` and its program: `create-task.ts`, `create-task-program.ts`,
  `create-task-cli-entry.ts` (built by `vite.create-task-cli.config.ts`), `create-task-install.ts`
  (what the app writes under `~/.claude` at launch), each beside its `.test.ts`
- Screen: `board-view.ts`, `board-detail.ts`, `board-toolbar.ts`,
  `board-state.ts`, `board-drag.ts`, `drop-marker.ts`, `card-aim.ts`, `card-editor.ts`,
  `board-saves.ts` (the screen's saves, one at a time, each beside the board it replays from),
  `board-wiring.ts` (the board's files written elsewhere, re-read on the page in front)
- The delete key: `card-delete.ts`, Cancelled or gone
- Narrowing: `board-filter.ts`, `filter-dialog.ts`, `card-search.ts`
- Styles: `board.css`
- Tests: `test-board.ts` (helpers), `board.test.ts`, `board.columns.test.ts`,
  `board.tree.test.ts`

## /create-task

Quick capture from any Claude session: `/create-task <what the task is>` files one card on the
project's board on the default branch of its remote and pushes it, leaving the branch, HEAD, index
and working tree it is run from alone. It needs no Dashboard pane and no `DASHBOARD_BOARD`, so a
plain terminal, another project or a headless review agent runs it the same.

At every launch the installed app writes three files, and rewrites them only when this
build's copy differs. A dev run (`pnpm start`) installs nothing; run a branch's program by hand with
`node .vite/build/create-task-cli-entry.js`.

- `~/.claude/skills/create-task/SKILL.md`, the `/create-task` skill
- `~/.claude/skills/create-task/create-task.js`, the program it runs, with a
  `#!/usr/bin/env node` line and mode 0755 so it runs as a command
- `~/.claude/skills/create-task/package.json`, `{"type":"commonjs"}`, so a `"type": "module"`
  package.json in `~/.claude` or `~` cannot make node read the program as ESM

The program's path is fixed: `claude-pr-loop` runs it as an executable through `PR_LOOP_CARD_SCRIPT` with
`--title`, `--notes` and `--priority`, and `--remote <name>` on a repo whose board lives on a
remote other than `origin`. `--column <name>` picks the column (Backlog otherwise), `--seed`
creates a board missing from the default branch, from this checkout's copy when it has one, and
`--dry-run` prints the files it would commit instead of pushing them.

The card is written by the `board` command's own `add`, in a worktree of `<remote>/<default>`
made for that one commit in the system temp folder and removed after, so it carries the same
fields as one added on the board. The commit is `board: add "<title>"`, and takes in every board
file with `git add -A`: on a default branch still on `board.json`, that one commit is the move into
the folder, the old file's removal included. The worktree add, commit and
push run with `core.hooksPath=/dev/null`, since the project's hooks are for its code. A push that
loses a race (fetch first, non-fast-forward, or the remote moving mid-push) fetches and tries once
more; any other refused push prints git's own sentence and is not retried.
It refuses, and pushes nothing, when the default branch has no board (it names `--seed`), when the
board there does not parse, and when it cannot tell which branch on the remote is the default.

## Scenarios

- Given a plain terminal in a folder with no `.dashboard` and no git repository above it, when `dashboard board list` runs, then it is refused naming `--project` and no board is seeded there.
- Given `crm` in `~/.dashboard/projects.yaml`, when `dashboard board move <id> Done --project crm` runs from any folder, then the card moves on crm's board.
- Given the board is on screen, when `board move` writes the file from a pane, then the board re-reads without moving your selection.
- Given the power goes out just after a board, notes or session write, when the app next launches, then it reads the old file or the new one, never an empty one (`replaceFile` flushes before it renames).
- Given an agent ran `board move` after the board last read the file, when you rename another card before the reload arrives, then the file keeps both: the agent's move and your rename.
- Given an agent ran `board move`, when you rename a card twice and the board's re-read lands between the two writes, then the board reads again and shows the second rename.
- Given a card with subtasks, when you blank its title, then it is refused and the status bar says to delete it with `d`.
- Given you deleted a card, when you undo, then it comes back where it was.
- Given a card in Doing, when you press `d`, then it moves to Cancelled with no question; `d` on it there asks, and Enter deletes it for good.
- Given a board written before Cancelled existed, when the app or the command reads it, then it has an empty Cancelled column last.
- Given the board's first read failed, when you press a key, then the board refuses it instead of writing over the file.
- Given a card's pull request is open, when its agent finishes, then the card goes in Review, not Done.
- Given a filter keeps a card only because you just changed it, when an arrow moves the selection off it, then the board redraws and the card is gone; an arrow that leaves the drawn cards as they are and lands on one of them only moves the highlight.
- Given a feature branch with uncommitted work, when `create-task.js --title t --notes n --priority high` runs, then the card is on `origin/main` in Backlog with that notes and priority, and the branch, HEAD and working tree are as they were.
- Given a repo whose board lives on a second remote, when `create-task.js --remote gitlab` runs, then the card is pushed there and `origin` is untouched; `--remote ""` is refused.
- Given the default branch has no board, neither `.dashboard/board/` nor `.dashboard/board.json`, when `create-task.js` runs without `--seed`, then it pushes nothing and says to re-run with `--seed`.
- Given a project still on `.dashboard/board.json`, when the board is first written, then every card is in its own file under `.dashboard/board/cards/`, `board.json` is gone, and the board reads back the same (`board-files.test.ts`, on a copy of this repository's own board).
- Given a card file that does not parse, or parses to something that is not an object, when the board saves a change it read with a look, then that file is still there with its bytes; when the board next reads, it is set aside as `<id>.json.broken` (`<id>.json.2.broken` if that name is taken) and every file set aside is named (`board-files.test.ts`).
- Given a board file that does not parse, when the `board` command or a ship's Ship move would write, then the file is left under its own name, nothing is written or committed, the command exits 1 and the ship fails naming the file, and the same happens on every run after until the file is fixed (`board-files.test.ts`). Given a card file the app set aside, the review sweep does not mark that card as deleted (`review-flow.test.ts`).
- Given two branches that each add a card, or each move a different card, when both merge, then git merges them with no conflict (`board-files.test.ts`, with real merges).
- Given the app launches, when `~/.claude/skills/create-task/` already holds this build's files, then none is rewritten.
- Given an installed `create-task.js` with mode 0644, when the app launches, then it is 0755 and runs as a command, its bytes not rewritten.
- Given the remote's hook declines the push, when `create-task.js` runs, then it prints git's sentence and pushes once, not twice.
- Given `--dry-run`, when `create-task.js` runs, then the remote's main is unchanged.
