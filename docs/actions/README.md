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

- **project.open** (`projects:open`, `project open`, `pane claim --project`):
  waits for the pane and screen hosts, refuses a folder that is not there,
  opens over a dead page, and starts main and waits for it only for the
  command. The picker's folder dialog and path check stay its
  door's, `project-actions.ts`.
- **project.close** (`projects:close`, `project close`): `closeRefusal`, asked
  here alone. The close key asks it twice, `onlyCheck` before its question and
  again with the close, naming the panes by the page's names; the command
  names them by default and asks no question.
- **project.focus** (`project focus`, a notification's click): the window to
  the front on the project's main, or on the pane the banner named.

- **session.start** (a restart, a kept worker screen, `project open`): whether a
  page's main starts before anyone looks at it (`startsAtOpen`, only for a
  restart's); the command's answers once main can be reached.
- **session.reset**, **.resume**, **.branch**, **.rewind** (/clear, /resume,
  /branch, /rewind): `keepsItsConversation` refuses all four on main's worker
  screen. A resume of a conversation a pane runs, or main's on a screen opened
  by hand, is refused; a rewind counts the code back by a dry run first.
- **session.rename** (/rename, the drawer's F2): the conversation's one name,
  written as its transcript's title and its drawer row's label from either door
  (actions-decision-7).
- **session.configure** (model, mode, effort, fast): kept for the next start,
  and the running session moved onto it; none is started for it.

- **settings.write** (`settings:write`, launch's host token, a remote join
  saving its address): the settings' one writer. Keeps the change as main's
  live copy with the shell it picks, then writes the file; a pane already
  running keeps its shell. The launch tidy (`tidySettingsFile`,
  `settings-store.ts`) still rewrites the file's own lines outside it.

Everything else that changes state still does it from its door. Every one of
them, the action it moves behind and the order the nouns move in are in
[`inventory.md`](inventory.md); `bypasses.test.ts` pins the calls and wrappers
that still do the work themselves; the rows it does not pin are held by the
rule alone (actions-rule-1, actions-decision-4).

Only card.move and settings.write have a channel of their own name
(`card:move`, `settings:write`); settings.write's is the one that was there,
answering with the shell rather than the action's result. The pane and project
actions answer on the channels and commands that were there before
(`pane:add`, `pane:close`, `sessions:resume`, `projects:open`, `projects:close`, `pane claim`, `send`, `release`, `run`,
`project open`, `close`, `focus`), and so do the session actions (`chat:reset`,
`chat:resume`, `chat:branch`, `chat:rewind`, `chat:rename`, `chat:configure`,
`sessions:rename`); a screen that needs ship or review registers its
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
- `session/session-actions.ts` — main's wiring: the session actions, their ports and the screen's doors
- `session/start.ts`, `session/reset.ts`, `session/resume.ts`, `session/branch.ts`, `session/rewind.ts`, `session/rename.ts`, `session/configure.ts`
- `session/conversation-ports.ts` — what reset, resume, branch and rewind ask of the session, and `keepsItsConversation`
- `settings/settings-actions.ts` — main's wiring: settings.write and the screen's `settings:write`
- `settings/write.ts`
- `src/shared/board/column-entry.ts` — the transition table

## Scenarios

- Given a card in Todo, when `dashboard board move <id> Ship` runs, then the card is written into Ship and shipped, exactly as a drag into Ship does (`move.test.ts`).
- Given `review.autoLoop` off, when a shipped card's pull request appears, then the card is moved into Review and no review starts until it is moved into Review by hand or `dashboard board review <id>` runs (`review-flow.test.ts`, `column-entry.test.ts`).
- Given an agent moving its card on its worktree's board, when the move lands, then nothing starts (`column-entry.test.ts`), and `board move <id> Review` there is a file edit that exits 0 without asking the app (`board-cli.test.ts`, `linked-worktree.test.ts`).
- Given a conversation on the Claude screen, when you `/rename` it, then the drawer lists it by that name too; renamed in the drawer, `/resume` lists it by the drawer's name (`rename.test.ts`).
- Given main's worker screen, when you send /clear, /resume, /branch or /rewind, then each is refused and the conversation stays (`conversation.test.ts`).
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
  until the app is restarted. Every other move, and every move on a worktree's
  board (a folder in `<project>.worktrees/` whose `.git` points back into that
  project, `linked-worktree.ts`; a bare repository's checkout is a project and
  keeps Ship and Review), is
  a file edit (`asksApp` in `board-cli.ts`) and works with the app closed.
- Shift+Right through Review to Done, slowly enough that each save lands before
  the next keystroke, starts the review loop at the Review step: the walk is
  read one step at a time.
