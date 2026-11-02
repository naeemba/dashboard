# Notes: decisions

Settled questions. Read the entry before re-litigating it.

## notes-decision-1: Handwriting is a separate page, not ink over the text

The handwriting has a page of its own, with its own file and its own key to turn
to it. It is not drawn over the text box.

Text reflows. Narrow the window, change the font, add a line at the top and every
word moves; ink drawn over it stays where the pen put it, so an underline ends up
under something else and a circled word is circled around nothing. A page of
ink has no such problem because nothing under it moves. It also keeps the two
files independent: the text stays a plain file an editor opens, and the ink is a
picture a browser opens, and neither has to know the other exists.

## notes-decision-2: SVG, with the raw points in `data-*` attributes

`notes-ink.svg` is a standalone SVG: one filled path per stroke, so a browser or
a forge draws the page as written. The points each stroke was made of ride along
in `data-points`, with the colour and width in `data-color` and `data-width`.

A filled outline cannot be turned back into the line it came from, and the page
has to stay editable — read it, undo, erase, draw on — so the data is kept beside
the picture rather than recovered from it. The output is deterministic and one
path to a line, so it diffs. The reader (`parseInk`) accepts only what the writer
makes: a file it cannot read is never written over, because nothing about
someone's hand-edited SVG says what parts of it matter.

## notes-decision-3: Drawing is pointer input; everything around it has a key

Drawing is pointer input by nature, the way typing is keys. Nothing on the page
can be done without a mouse that matters to a person who draws: the strokes are
the mouse's, a pen's or a finger's. Every action around them — the toggle between
the pages, the pen and eraser, the colour, the width, undo and clear — has a key,
which is what conventions-rule-1 asks. The strip along the top only displays the
choice; it is not a row of buttons, and clicking it does nothing.

Clear is a plain key because it is a step undo takes back, not because it is
safe.
