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
  loop, a resume after a restart or from the drawer, New Claude — screen or
  terminal, decided once in `paneKind` (workers-decision-8). Every resume is
  Claude Code run as the pane's process, with its worker hooks when it is
  main's, an agent-start line in the log and the pane counted working; nothing
  types `claude --resume` into a shell (actions-decision-5).
- **pane.open** (`pane:add`, the drawer's resume, `pane claim`): a new worker at
  the lowest number going, a shell, New Claude or a conversation carried on.
- **pane.close** (`pane:close`, `pane release`): an open worker dropped, and a
  card record's claim on it ended.
- **pane.send** (`pane send`): a screen's prompt, or typed into the shell.
- **pane.claim** and **pane.release** (`pane claim`, `pane release`): bound by
  the session command, `session-requests.ts`, on its ledger of who claimed and
  ran each pane; the asker's right to the pane is checked there first.
- **pane.restore** (a project opening, the manager once the hosts answer): what
  each pane the last run left comes back as, a kept shell adopted, a saved
  conversation through pane.dispatch, a worker screen over its pane.

- **worktree.make** (a ship, a review, `pane run --worktree`): a card's branch
  off origin's base, a reviewed card's branch checked out again, or a
  throwaway named after its prompt, each made only there. Only
  the throwaway takes the project's queue and fetches; the ship and the review
  hold the queue already, and it is not re-entrant.
- **worktree.remove** (`worktree:remove`, `pane release`, the review):
  `removalOf` says, per door, whether it is forced (only the dialog's, after
  you said yes), queued on the project (all but the review's, which holds it)
  and logged (all but the review's, which writes on the card). The keeper does
  the rest: refused once with changes, shells killed and screens closed.

Everything else that changes state still does it from its door. Every one of
them, the action it moves behind and the order the nouns move in are in
[`inventory.md`](inventory.md); `bypasses.test.ts` pins the calls and wrappers
that still do the work themselves; the rows it does not pin are held by the
rule alone (actions-rule-1, actions-decision-4).

Only card.move has a channel of its own name: it is the only action the bridge
exposes that way. The pane actions answer on the channels and commands that
were there before (`pane:add`, `pane:close`, `sessions:resume`, `pane claim`,
`send`, `release`, `run`); a screen that needs ship or review registers its
channel in the same change.

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
- `bypasses.test.ts` — the calls and wrappers that change state outside an action, and where
- `card/card-actions.ts` — main's wiring: shipFlow, reviewSweep and the three
  card actions with their ports
- `card/move.ts`, `card/ship.ts`, `card/review.ts`, `card/card-input.ts`
- `card/project-board.ts` — whether a folder's board is a project's own
- `pane/pane-actions.ts` — main's wiring: dispatch, open, close, send and restore with their ports
- `pane/dispatch.ts` — pane.dispatch and `paneKind`
- `pane/open.ts`, `pane/close.ts`, `pane/send.ts`, `pane/claim.ts`, `pane/release.ts`, `pane/restore.ts`
- `pane/pane-input.ts` — the input checks the pane actions share
- `worktree/worktree-actions.ts` — main's wiring: make and remove, and each door's port into them
- `worktree/make.ts`, `worktree/remove.ts`
- `src/shared/board/column-entry.ts` — the transition table

## Scenarios

- Given a card in Todo, when `dashboard board move <id> Ship` runs, then the card is written into Ship and shipped, exactly as a drag into Ship does (`move.test.ts`).
- Given `review.autoLoop` off, when a shipped card's pull request appears, then the card is moved into Review and no review starts until it is moved into Review by hand or `dashboard board review <id>` runs (`review-flow.test.ts`, `column-entry.test.ts`).
- Given an agent moving its card on its worktree's board, when the move lands, then nothing starts (`column-entry.test.ts`).
- Given a refused ship, when the board or the command asked, then the card stays where it was put and the answer says why (`move.test.ts`).
- Given a new IPC handler that calls `worktrees.remove` itself, when the tests run, then `bypasses.test.ts` fails naming the file.
- Given a removal from the worktree dialog while a ship of the same project is running git, when you press `d`, then the removal waits for the ship rather than racing it onto git's lock (`remove.test.ts`).
- Given a card's `pane run` into a pane another card's record still names, when it starts, then that record gives the pane up and the card's names it (`worktree-keeper.test.ts`).
- Given a Claude of yours running in a terminal pane, when the app restarts, then it comes back through pane.dispatch on its conversation, not typed into a shell (`restore.test.ts`); it is logged as an agent start, and once you exit it the pane reads exited and Enter gives a shell (checked by hand).
- Given a conversation in the drawer, when you press Enter on it, then a new worker runs it through pane.dispatch, never a shell typed into (`open.test.ts`).

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
