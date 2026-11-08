# Actions

The things the app does on request, each defined once in main and reached from
the screen over IPC and from the `dashboard` command over the session socket.
Neither door holds any of the logic; each only asks.

## What there is

- **card.move** (`card:move`, `dashboard board move <id> <column>`): writes the
  move through `board-store.ts`, then asks `columnEntry` in
  `src/shared/board/column-entry.ts` what entering that column starts, and runs
  it. The table:
  - into Ship: card.ship
  - into Review, moved by a person (the board or the command): card.review
  - into Review, moved by the app (a shipped card's pull request appeared):
    card.review only with `review.autoLoop` on
  - anything else, and any move on a worktree's or the manager's board: nothing

  A move into the column the card is already in writes nothing and still runs
  the entry: the board has written its own move already when it asks, and it is
  how a ship that stopped part way is picked up or a waiting card's loop started.
  The board's ask never moves the card: one a later keystroke has moved on
  starts nothing. A refused ship or review leaves the move written and answers
  why.
- **card.ship** (`dashboard board ship <id>`): `shipFlow` in `ship-flow.ts`, for
  a card on a project open in the app.
- **card.review** (`dashboard board review <id>`): the review start in
  `review-flow.ts` — the worktree swapped for a review one and `/pr-loop`
  started in it. Refused for a card with no worktree, no pull request on its
  branch's board, an agent still working, a review already running, or a card
  past Review. One started this way that meets a dirty worktree is started
  again by the sweep once the commit lands, whatever the setting.

- **pane.dispatch**: every agent a pane starts — `pane run`, a ship, the review
  loop, a resume after a restart, New Claude — screen or terminal, decided once
  in `paneKind` (workers-decision-8). Main calls it; it has no door yet.

Only card.move has a channel: it is the only action the bridge exposes. A screen
that needs ship or review registers its channel in the same change.

The board asks card.move only for a move that changed the column
(`screenMoveEntry` in `column-entry.ts`), in either direction, as the agreed
design has it. A card in Done cannot be moved by key at all, only dragged
(board-decision-3), so a finished card is never walked back into a review and
a ship by mistake.

A move carries its source: `user` from the screen, `command` from the command,
`automatic` from the review sweep. The door sets it; a caller cannot. An agent
editing its worktree's board is not a move request and starts nothing.

## The setting

`review.autoLoop` in settings.json, the Review row on the settings screen,
default on. Off, a card whose pull request opens is moved into Review by the
sweep and waits; a move into Review by hand or `dashboard board review <id>`
starts its loop.

## How one is written

`action('card.move', { words, input, run(ports, input) })` in
`src/main/actions/action.ts`. `input` is the one check of what came in, at the
edge; `run` returns a result with an `output` line or `{ refused }`
(errors-rule-2); dependencies come in as ports, so a test passes fakes. `words`
names the command's positional words after the verb. `bind` gives an action its
ports, and `registerActions` and `actionRequests` bind each action to its
channel (`<noun>:<verb>`, app-rule-1) and its board verb, once. The command's
side is `APP_VERBS` in `board-cli.ts`; `action.test.ts` pins that it matches
what `cardActions` serves.

## Files

Folder: `src/main/actions/`.

- `action.ts` — the action shape and the registry
- `card/card-actions.ts` — main's wiring: shipFlow, reviewSweep and the three
  card actions with their ports
- `card/move.ts`, `card/ship.ts`, `card/review.ts`, `card/card-input.ts`
- `card/project-board.ts` — whether a folder's board is a project's own
- `pane/pane-actions.ts` — main's wiring: pane.dispatch's terminal and screen halves
- `pane/dispatch.ts` — pane.dispatch and `paneKind`
- `src/shared/board/column-entry.ts` — the transition table

## Scenarios

- Given a card in Todo, when `dashboard board move <id> Ship` runs, then the card is written into Ship and shipped, exactly as a drag into Ship does (`move.test.ts`).
- Given `review.autoLoop` off, when a shipped card's pull request appears, then the card is moved into Review and no review starts until it is moved into Review by hand or `dashboard board review <id>` runs (`review-flow.test.ts`, `column-entry.test.ts`).
- Given an agent moving its card on its worktree's board, when the move lands, then nothing starts (`column-entry.test.ts`).
- Given a refused ship, when the board or the command asked, then the card stays where it was put and the answer says why (`move.test.ts`).

## Known limits

- A card shipped from the command stays in the Ship column on the project's
  board. Walking a shipped card back to the column it came from is still the
  board view's (`bringHome` in `ships-away.ts`), so only a ship from the screen
  goes home.
- `ship`, `review` and a `move` into Ship or Review need the running app, of the
  same build as the command; a rebuilt command against an older app is refused
  until the app is restarted. Every other move is a file edit (`asksApp` in
  `board-cli.ts`) and works with the app closed.
- Shift+Right through Review to Done, slowly enough that each save lands before
  the next keystroke, starts the review loop at the Review step: the walk is
  read one step at a time.
