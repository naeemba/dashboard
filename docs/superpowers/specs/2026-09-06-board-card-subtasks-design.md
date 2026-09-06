# Subtasks: cards that belong to other cards

A board card is a flat row today. This lets any card name another card as its
parent, so a big piece of work can be broken into smaller ones that are still
ordinary cards — they sit in columns, carry a priority, and move between
columns on their own.

The relationship is the only new idea. A subtask is not a lesser kind of card
and gets no reduced set of features. It can have subtasks of its own, to any
depth.

## Scope

- A card gains `parent`: the id of another card, or null.
- A card with a parent draws a badge naming it.
- A card with children draws a bar showing which columns those children are in.
- `Tab` attaches the selected card to the card above it; `Shift+Tab` detaches.
- `o` opens a card, showing its notes, its parent and its children.
- `n` inside an open card adds a child.
- `d` asks for confirmation, then deletes the card and every descendant.

Not in scope: a done tick separate from the columns, drawing children indented
underneath their parent, folding a card shut, dragging with the mouse, moving a
whole family between columns in one keystroke, or remembering where a detached
card used to live.

## The relation

`Card` gains one field:

```ts
export type Card = {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  parent: string | null;
};
```

`parent` is the whole relation. There is no `children` array. Two lists that
have to agree eventually will not: a hand-edited `board.json` that sets a
card's `parent` and forgets the parent's `children` leaves the screen and the
keys reading different answers about who owns what. One field cannot
disagree with itself.

Children are found by scanning the board for cards that name a card as their
parent:

```ts
export function childrenOf(board: Board, id: string): Card[];
```

The order is the order the children already sit in — columns left to right,
rows top to bottom within a column. That order is what `Shift+Up` and
`Shift+Down` already move, so reordering subtasks needs no new key and no
stored list.

`childrenOf` walks every card in every column. A board with a few hundred cards
does that in well under a millisecond, and the board redraws on a keystroke,
not on a frame.

## Where a subtask lives

A subtask is a card in a column like any other. It is not drawn inside its
parent, and it does not have to be in its parent's column. A parent can sit in
Todo with one child in Doing and two in Done.

That is what makes the whole thing work without a second notion of done. A
subtask is finished the way any card is finished: it moves to the Done column.
Its parent still knows about it, because the parent is found through the id,
not through the column.

`Shift+Left` and `Shift+Right` keep exactly their current meaning for every
card, subtask or not.

## The file

`board.json` gains one key per card:

```json
{
  "id": "a350c135-4cf6-4e14-a180-d84e487c653f",
  "title": "Give board cards subtasks",
  "notes": "…",
  "priority": "medium",
  "parent": null
}
```

An existing file has no `parent` anywhere. `parseCard` reads a missing or
non-string `parent` as null, so every board written before this change loads as
a board of top-level cards, which is what it is.

Two things a hand-edited file can say that the rest of the code cannot cope
with, both repaired on read:

- **A parent that names no card.** The id was mistyped, or the parent was
  deleted by hand. The child keeps everything else and becomes top-level.
- **A loop.** A is B's parent and B is A's, or any longer ring. Drawing that
  never finishes and `childrenOf` recurses forever. On read, the card that
  closes the ring loses its parent.

Repairing rather than rejecting matters: the alternative is `parseBoard`
throwing, which the view turns into "board file was damaged" and a board you
cannot see. One bad id should cost one relationship, not the whole board.

## On the card

Two additions to how a card draws. Neither changes its size when it has no
parent and no children, so a board that uses none of this looks as it does now.

**The badge.** A card with a parent shows a small line above the title with the
parent's title in it, truncated to one line. It says which piece of work this
card belongs to, which is otherwise invisible from the column.

**The bar.** A card with children shows a thin segmented bar and a count. Each
child contributes one segment, coloured by the column it is in:

- the last column — green
- the first column — empty
- anything in between — yellow

Position, not name. The columns come from the file and can be renamed or added
to; a board whose last column is called "Shipped" should read the same as one
that calls it "Done". The count beside the bar is children in the last column
over total children — `3/7`.

A board with one column draws every child green, which is the honest reading of
a board where the only column is also the last one.

## Keys on the board

| Key | What it does |
|-----|--------------|
| `Tab` | The selected card becomes a child of the card above it |
| `Shift+Tab` | The selected card loses its parent |
| `o` | Open the card |
| `d` | Confirm, then delete the card and every descendant |

`Tab` looks at the card directly above in the same column. On the top card of a
column there is nothing above, and the key does nothing. `Tab` is also refused
when the card above is already a descendant of the selected card, because that
makes a loop; the status bar says so rather than the key silently failing.

`Tab` and `Shift+Tab` change the board, so both go through the same undo step
every other change uses.

## Opening a card

`o` opens a dialog over the board — the same dark sheet the picker and the help
dialog already use, from `overlay.ts`. It shows:

- the title and priority
- the notes, in full
- the parent, if there is one
- the children, each with its column and its priority

Keys inside: arrows walk the list of children, `Enter` jumps to the selected
child on the board and closes the dialog, `n` adds a new child, `Escape`
closes. A new child is created in the parent's column, at the bottom, and the
dialog stays open with the new row in the list — adding five subtasks is five
presses of `n` and five titles, without leaving the card.

The dialog does not edit the title, the notes or the priority. `Enter`, `e` and
`p` already do that on the board, and a second way to do the same thing is a
second thing to keep working.

## Deleting

`d` opens a confirmation over the board:

> Delete "Give board cards subtasks" and its 7 subtasks?

`Escape` cancels and is what the dialog opens on. Confirming deletes the card
and every descendant, across every column, as one change — so `u` brings the
whole family back.

The count is descendants, not just direct children, because that is the number
of cards that will disappear. A card with no children gets the same dialog
without the second clause. `d` behaving one way is worth more than saving a
keystroke on leaf cards.

This is a change to a key that used to delete immediately. It is worth it here:
`d` could only ever cost one card before, and `u` was a full answer. Now one
press can remove eight cards, five of them in columns that are not on screen.

`board.json` is committed to git, so a delete that gets past both the dialog
and undo is still recoverable from the repository. That is the reason this
stops at a dialog and one undo step rather than growing a trash column or a
deeper history.

## Where the code goes

- `board.ts` — the `parent` field, `childrenOf`, collecting a subtree,
  attach and detach, delete-with-descendants, and the loop check.
- `board-store.ts` — reading and writing `parent`, and repairing dangling
  parents and loops on read.
- `board-view.ts` — the badge, the bar, and the new keys.
- `board-detail.ts`, new — the dialog `o` opens. `board-view.ts` is already
  around 250 lines; the dialog is its own screen with its own keys, which is a
  seam, not an arbitrary split.
- `overlay.ts` — a small confirm built on the sheet already there.
- `help.ts` — rows for `Tab`, `Shift+Tab` and `o`, a changed row for `d`, and a
  blurb that mentions subtasks.
- `index.css` — the badge, the bar, the dialog.

## Testing

`board.test.ts` — attaching and detaching, the order `childrenOf` returns,
`Tab` refused when it would make a loop, deleting a parent taking descendants
in other columns with it, and undo bringing them all back.

`board-store.test.ts` — a card with a parent surviving a write and a read, a
board written before this change loading with every card top-level, a dangling
parent id becoming null, and a loop being broken rather than throwing.

`help.test.ts` already pins the board rows, so the new keys have to be listed
there for the suite to pass.
