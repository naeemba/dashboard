# Conventions: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## conventions-rule-1: Keyboard first

Every action must be reachable from the keyboard alone. A control that only
responds to a click is unfinished. A new choice belongs in a list the arrow keys
already walk over, not in a button beside it.

**A click on a row moves the selection to that row, then does what Enter does
there.** The highlight is the only thing on screen saying where the keyboard is.
Click `web` to open it, press Enter, and `api` collapses — you opened one
project and closed another.

That holds where Enter does nothing too. A quiet project has nothing to open, so
the click only moves the selection; if the screen is not redrawn, the highlight
stays on `api` while the keyboard is on `web`.

**A mouse gesture that reaches one of the manager's boards makes that board
active first.** Otherwise you click a card on `api`, press Shift+Right, and a
card in `web` moves — into Ship if it was in Todo, which makes a worktree and
starts an agent on the project you were not looking at. An inactive board's
outline is off in the CSS, so nothing on screen says where the keyboard went.

## conventions-rule-2: Every box you type into carries `dir="auto"`

**A new `<input>` or `<textarea>` gets `input.dir = 'auto'` in the same change
that adds it.** Everything outside a terminal is `unicode-bidi: plaintext`, which
fixes reading order but not the caret. Without it you type a Persian card title
and the text runs away from the cursor, ending punctuation lands on the wrong
side, and Home and End go to the opposite ends of what you see.

`text-direction.test.ts` holds it: each `input` or `textarea` is found by the
variable it is assigned to, and that variable must set `dir = 'auto'` in the
same file, so a new box without it fails `pnpm test` with its file and name. A
`dir` set on a wrapper does not count for the box inside it.

## conventions-rule-3: `hidden` only hides what the stylesheet left alone

`element.hidden = true` hides by way of the browser's own `[hidden] { display:
none }`, and any `display` in our CSS beats it. **So whenever a class gets a
`display`, every element that class hides with the attribute needs a
`.thing[hidden] { display: none }` beside it.**

What it looks like: the manager's column names and its total joined the rows'
`display: flex` so they would line up with them. Close every project and the
page says "No project is open, so there is nothing to watch yet." with `5h week
all` sitting over an empty list and a rule across the foot of the window holding
three blank cells. `.view[hidden]` in `index.css` is the same trap the other way
round — there the `display` is on purpose, so the views hide with `visibility`
instead.

No test can catch this. Vitest runs in node here, with no DOM; jsdom is not
installed. Even in a DOM test environment the user-agent stylesheet is absent,
so `hidden = true` would read back as hidden whatever the CSS says.

## conventions-rule-4: 600 code lines a file

**`max-lines` in `eslint.config.mjs` refuses a file over 600 lines of code.**
Comments and blank lines do not count (`skipComments`, `skipBlankLines`), so a
file is never split by deleting or moving its explanation: 260 lines of logic
under 330 lines of reasoning passes. Over the limit means the file does more
than one job; split it along that seam, not into `foo-part2.ts`.

The exceptions are generated files, lockfiles, vendored code and data-only files
(fixtures, long literal tables). Each one is a `files` override beside the rule
in `eslint.config.mjs` with its reason in a comment, and a file left over the
limit on purpose is also a decision in its feature's `decisions.md`. There are
none yet. An override list that grows without reasons is the rule gone again:
a 900-line `renderer.ts` passes `eslint .` and nobody notices.

`eslint.config.test.ts` pins it: 601 code lines fail, 600 under a page of
comments pass. Nothing stops an inline `eslint-disable max-lines`; never write
one.

eslint reads only `.ts` and `.mjs`, so `stylesheet-size.test.ts` holds the
stylesheets: every `src/**/*.css` at or under 600 lines once `/* … */` and blank
lines are gone. Without it `chat.css`, at 594, would cross the limit with both
eslint and CI green.

What it looked like before: the limit lived only in the global instructions, so
a file grew one card at a time with nothing refusing it. `board-view.ts` reached
599 code lines and `renderer.ts` 587.
