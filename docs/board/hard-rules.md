# Board: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## board-rule-1: The board has two writers

The app is not the only thing writing `.dashboard/board.json`. The `board`
command does too, and an agent working a card uses it to move its own card.
**Anything that writes a board goes through `board.ts` and `board-store.ts` —
never its own JSON.**

What a second copy costs: someone teaches the command line to write a card
without `createdAt`. The app reads it back, `relativeAge` has nothing to show,
and the card's detail dialog says the card was never made. Nothing fails; the
board quietly stops agreeing with itself.

`board-cli.ts` holds the command's decisions and every one is a call into
`board.ts`. `board-cli-entry.ts` is the file and the terminal, with no decision
in it.

The app has to notice. Main watches each open project's `.dashboard` folder and
sends `board:change`, and the board re-reads itself without moving your
selection. It watches the *folder*, not the file — `writeBoard` renames a
temporary file over `board.json`, and a watch on the file follows the old one
into the bin. It compares bytes against what the app last wrote, or every
keystroke would redraw the board under your cursor thirty times a minute.
`isBoardChange` in `board-watch.ts` is that rule, with the test.

## board-rule-2: A card with a pull request open goes in `Review`, not `Done`

**A card with a pull request open goes in `Review`, not `Done`.** A column on
`main` says what has been merged; `Review` is the exception — a pull request
open and nothing has checked it. This beats the global instruction to move a
card to Done once the PR is ready, which is written for boards with no Review
column. Otherwise the board says a feature is finished and checked while nobody
has looked at it, and `Review` sits empty in front of the person whose job it is
to look.

**The move into `Done` happens on the branch first, and only then is the pull
request merged.** The branch's board is the copy the merge carries into `main`,
so a card moved after the merge never reaches `main` at all. Move it afterwards
and `main` goes on committing `Review` for a feature that shipped weeks ago,
while the only copy saying `Done` is an uncommitted change in one person's
checkout — true on screen, true nowhere else, and never converging. This repo's
own board was found exactly like that: `origin/main` saying `Review` for a
merged card and the working tree saying `Done`.

The app's board is moved too, after the merge, because it is what is on screen
and nothing on screen changes when a merge happens on a server. Both moves, in
that order: branch, merge, app. `reviewPrompt` in `review.ts` is where it is
written down, and `review.test.ts` pins the order.
