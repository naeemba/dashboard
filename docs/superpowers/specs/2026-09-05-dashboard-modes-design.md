# Modes: terminals, nvim, board

Each project page today is a fixed grid of five shells. This adds two more ways
to look at a project — a full-window nvim, and a keyboard-driven kanban board —
and three keys to move between them.

## Scope

- A page shows one of three views: `terminals`, `nvim`, `board`.
- The mode is per project. Each page remembers its own.
- Ctrl+T terminals, Ctrl+N nvim, Ctrl+B board.
- Nvim mode is one pane running `nvim` in the project folder.
- Board mode is a kanban built in the renderer, stored in the project's
  `.dashboard/` folder.

Not in scope: multiple boards per project, card due dates, labels, assignees,
search, a file watcher on `board.json`, syncing anything anywhere.

## Mode plumbing

`src/modes.ts` holds the type and nothing else:

```ts
export type Mode = 'terminals' | 'nvim' | 'board';
```

`Page` gains `mode: Mode`, defaulting to `'terminals'`, so a freshly opened
project looks exactly like it does today.

`page.element` stops being the grid. It becomes a plain container with three
children:

```html
<section class="page">
  <div class="view view-terminals">…five panes…</div>
  <div class="view view-nvim" hidden>…one pane…</div>
  <div class="view view-board" hidden>…columns…</div>
</section>
```

The grid rules in `index.css` move from `.page` to `.view-terminals`. A hidden
view follows the rule pages already follow — `visibility: hidden`, not
`display: none` — so xterm can measure a pane you have not looked at yet. Without
this, switching to nvim shows an 80x24 editor in a 1400px window until you
resize.

All three views are built when the page is built. The nvim *process* is not; see
below.

A missing project (its folder is gone) has no views at all — it keeps today's
single "Directory not found" message and ignores the mode keys. There is nowhere
to run nvim and nowhere to write a board.

## Keys

`mapShortcut` takes the page's current mode and returns the new actions:

```ts
| { kind: 'mode-set'; mode: Mode }
```

Ctrl+T, Ctrl+N and Ctrl+B map to `mode-set`, with one rule:

**A mode key returns `null` when you are already in that mode, so the pane gets
the keystroke.**

That rule is the whole reason these three keys are usable. Ctrl+N is nvim's
autocomplete. If the dashboard swallowed it, pressing it mid-word inside nvim
would throw you back to the terminal grid instead of completing the word. In
nvim mode Ctrl+N is nvim's; you leave with Ctrl+T or Ctrl+B, which nvim has no
strong use for. Likewise Ctrl+T reaches the shell as transpose-chars while you
are in terminals mode.

What is genuinely given up: in the shell, Ctrl+N no longer walks down history
and Ctrl+B no longer moves back one character. Both duplicate an arrow key.

Mode keys are plain Ctrl on every platform, matching the project keys already
there.

Other keys, by mode:

| Key | terminals | nvim | board |
|---|---|---|---|
| Cmd+1..5 | focus that pane | nothing | nothing |
| Alt+H/J/K/L | move between panes | nothing | nothing |
| Cmd+←/→ | previous/next pane | nothing | nothing |
| Ctrl+digit, Ctrl+S, Ctrl+O, Cmd+[ ] | unchanged | unchanged | unchanged |

Project keys keep working from every mode. Ctrl+2 from a board takes you to
project 2 in whatever mode project 2 was left in.

## Status bar

The right-hand span shows the mode:

- terminals: `terminal 3` (unchanged)
- nvim: `nvim`
- board: `board · Doing` — the column the selection is in

## Nvim mode

One pane filling the page, running `nvim` with the project folder as its working
directory. Splits are nvim's job.

The pane is a sixth pty for the project, id `terminalId(slot, TERMINAL_COUNT)` —
`"0:5"` for the first project. Everything a shell pane already does works
unchanged: data in, data out, resize, exit, restart.

`main.ts` currently keeps `terminalDirectories: Map<string, string>`. That map is
replaced by one that says what each id runs as well as where:

```ts
const terminalCommands = new Map<string, { command: string; directory: string }>();
```

`spawnProject` registers six ids — five running `shellCommand`, one running
`nvim` — but spawns only the five shells. The nvim entry is registered and left
unstarted.

The renderer starts it on first entry to nvim mode, by calling the existing
`bridge.restart(id)`. `pty:restart` already spawns an id that is registered but
not running, so no new IPC channel is needed.

Quitting nvim writes `[exited 0] press Enter to restart` into the pane, the same
line any dead shell shows, and Enter restarts it. That is existing renderer code.

If `nvim` is not installed, the spawn throws in main. Catch it and send a
`pty:exit` for that id with a non-zero code, so the pane shows the exit line
rather than the app dying.

## Board mode — storage

The first time a project's board is opened, the app creates:

```
<project>/.dashboard/
  board.json
  CLAUDE.md
  README.md
```

`board.json`:

```json
{
  "columns": [
    { "name": "Todo",  "cards": [{ "id": "3f2a…", "title": "Fix the resize race", "notes": "" }] },
    { "name": "Doing", "cards": [] },
    { "name": "Done",  "cards": [] }
  ]
}
```

`id` is `crypto.randomUUID()`. `notes` is written and preserved but has no editor
in this version; it exists so an agent can leave detail on a card without the
board dropping it on the next write.

`CLAUDE.md` documents the schema for an agent working in the repo: the shape
above, that `id` must be unique and stable, that columns are ordered, that
unknown fields are dropped on the next write from the app. `README.md` says what
the folder is for a human reading the repo.

Neither file is regenerated once it exists. If you edit `CLAUDE.md`, it stays
edited.

`.gitignore` is not touched. Committing the board is the user's decision.

### Reading

`src/board-store.ts` (main process) reads and writes, following the tolerance
`readRecentPaths` already uses: a missing, unreadable, or malformed file yields
the default three-column board rather than an error. Columns and cards are
validated field by field — a card without a string `title` is dropped, a column
without a `cards` array becomes empty. A hand-edited or agent-written file must
never stop the board opening.

A write failure (read-only folder, disk full) is reported to the renderer and
shown in the status bar. It must not be swallowed: losing cards silently is the
one failure that matters here.

### Freshness

The board re-reads from disk every time you enter board mode. That covers the
real case — you work in a terminal, Claude edits `board.json`, you press Ctrl+B
and see the change.

While you are looking at the board, an agent's write is not picked up; you see
stale cards until you switch away and back. Last write wins. A `fs.watch` on the
file is the upgrade if this bites, and is not built now. This ceiling is recorded
as a `ponytail:` comment where the re-read happens.

## Board mode — behaviour

`src/board.ts` holds the data operations as pure functions over the board plus a
selection `{ column: number; card: number }`. No DOM. This is where the tests go:

- `addCard(board, column, title)`
- `deleteCard(board, selection)`
- `moveCard(board, selection, direction)` — across columns and within one
- `renameCard(board, selection, title)`

Each returns a new board and the selection that should follow it. Moving a card
to a column that already has cards puts it at the same row index it had, clamped
to that column's length, so a card does not teleport to the bottom.

`src/board-view.ts` renders columns and cards and owns the keys:

| Key | Does |
|---|---|
| ←/→ | move between columns |
| ↑/↓ | move between cards |
| Enter | edit the selected card's title in place |
| Esc | stop editing, keeping what was typed |
| n | new card at the bottom of this column, straight into edit |
| Shift+←/→ | send the card to the column left/right |
| Shift+↑/↓ | reorder the card within its column |
| d | delete the selected card |
| u | undo the last board change |

Every change writes `board.json`. There is no save key.

`d` deletes on one keystroke, so `u` restores the board as it was before the last
change. One level, held in memory, cleared when the page is rebuilt. It covers
the mis-hit, which is the failure that actually happens.

The empty board shows three empty columns and a line saying `n` adds a card.

### Keys and the global handler

The window's capture-phase `keydown` handler currently ignores anything inside
`.picker`. It gains the same exemption for a card being edited: while an input in
the board has focus, plain letters go to the input, not to the board's `n`/`d`/`u`
handlers.

Arrow keys are safe — nothing global maps a plain arrow. Only Cmd+arrow is
taken, and that does nothing in board mode.

## Files

New:

- `src/modes.ts` — the `Mode` type
- `src/board.ts` — pure card operations
- `src/board-view.ts` — board DOM and keys
- `src/board-store.ts` — main-side read, write, folder seeding

Changed:

- `src/shortcuts.ts` — three mode keys, `mapShortcut` now takes the mode, and
  the terminal-only keys return `null` outside terminals mode
- `src/renderer.ts` — three views per page, mode switching, nvim pane, status
- `src/main.ts` — nvim pty registration, board IPC
- `src/bridge.ts`, `src/preload.ts` — `readBoard`, `writeBoard`
- `src/index.css` — view stacking, board layout

`renderer.ts` goes from 286 to roughly 340 lines, under the 600 ceiling.

## Tests

- `src/board.test.ts` — add, delete, rename, move across and within columns,
  selection after each, clamping at the ends
- `src/board-store.test.ts` — missing file, malformed JSON, a card missing its
  title, seeding a fresh `.dashboard/`, not overwriting an existing `CLAUDE.md`
- `src/shortcuts.test.ts` — the three mode keys, the pass-through rule (Ctrl+N in
  nvim mode returns `null`), Cmd+1..5 returning `null` outside terminals mode
- `src/modes.test.ts` — not needed; the type has no behaviour

## Rollout

Changing code does not restart the running app. Per `CLAUDE.md`, after the work
lands: run the checks, say the installed app needs a rebuild and restart, stop.
