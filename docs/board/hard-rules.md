# Board: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## board-rule-1: The board has two writers

The app is not the only thing writing the board in `.dashboard/board/` (and,
in a project not yet moved, reading `.dashboard/board.json`). The `board`
command does too, and an agent working a card uses it to move its own card.
**Anything that writes a board goes through `board.ts` and `board-store.ts` —
never its own JSON.** `board-store.ts` hands the folder's bytes to
`board-files.ts`, which is the only file that knows where they go; nothing
else names a card file. Committing a board names `BOARD_PATHSPECS`, never a
path of its own, so the move off `board.json` takes the old file's removal into
the same commit.

What a second copy costs: someone teaches the command line to write a card
without `createdAt`. The app reads it back, `relativeAge` has nothing to show,
and the card's detail dialog says the card was never made. Nothing fails; the
board quietly stops agreeing with itself.

`board-cli.ts` holds the command's decisions and every one is a call into
`board.ts`. `board-cli-entry.ts` is the file and the terminal, with no decision
in it.

The app has to notice. Main watches each open project's `.dashboard` folder,
everything under it, and sends `board:change`, and the board re-reads itself
without moving your selection. It watches the *folder*, not a file — every
file is replaced by renaming a temporary file over it, and a watch on the file
follows the old one into the bin. It compares a snapshot of every board file
(`boardSnapshot`) against the one the app last wrote, or every keystroke would
redraw the board under your cursor thirty times a minute. `isBoardChange` in
`board-watch.ts` is that rule, with the test. A burst of events is read once,
30ms after the first: the first write of a board still in `board.json` writes a
file per card, and reading the whole folder for each of them would redraw the
screen a hundred and seventy times.

Two writers through one file still overwrite each other unless each writes only
what it changed. The command re-runs itself on a fresh read just before it
writes (`runBoardCommandOnLatest`). The app sends `board:write` the board it
last read or sent beside its new one, and main replays the difference onto
the file as it is then (`rebaseBoardChange` in `board-merge.ts`), and answers
with what it wrote. The screen sends its saves one at a time
(`board-saves.ts`), so a save that failed is still inside the next one's
difference, and a read that lands while a save is out stays the base, since
the screen was rebuilt from it. What writing the whole board cost: an agent ran
`board move <id> Review` while you renamed another card, your save landed
before the watcher's reload, and the card was back in Doing with nothing on
screen saying so. `project-files-ipc.test.ts` reproduces it.

## board-rule-2: A card with a pull request open goes in `Review`, not `Done`

**A card with a pull request open goes in `Review`, not `Done`.** A column on
`main` says what has been merged; `Review` is the exception — a pull request
open and nothing has checked it. This beats the global instruction to move a
card to Done once the PR is ready, which is written for boards with no Review
column. Otherwise the board says a feature is finished and checked while nobody
has looked at it, and `Review` sits empty in front of the person whose job it is
to look.

**The app keeps this itself** (board-decision-6): it moves a card into Review
when its pull request opens and into Done when it merges, so neither move is an
agent's to remember. What follows is why the order matters.

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
