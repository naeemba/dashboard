# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B.

## board/

One file per card, so two branches working different cards never edit the same file:

    board/columns.json            { "columns": ["Backlog", "Todo", "Ship", "Doing", "Review", "Done", "Cancelled"] }
    board/cards/<id>.json         one card, with the column it is in and its place there

A card's file:

    {
      "id": "0f6a2c5e-...",
      "title": "Fix the resize race",
      "notes": "",
      "priority": "high",
      "parent": null,
      "createdAt": "2026-09-08T09:12:44.017Z",
      "updatedAt": "2026-09-08T09:12:44.017Z",
      "branch": "fix-resize-race",
      "pullRequest": 14,
      "comments": [
        { "at": "2026-09-09T11:02:10.551Z", "body": "The race is in the debounce, not the observer." }
      ],
      "column": "Todo",
      "order": 3
    }

A project the app has not written to since this layout arrived still has the older `board.json`
here instead — the whole board in one file, `{ "columns": [{ "name": "Todo", "cards": [...] }] }`.
It is read the same, and the next write moves every card into `board/` and removes it. Commit the
two together: `git add -A -- '.dashboard/board*' ':(exclude).dashboard/board*.broken' ':(exclude).dashboard/board*.tmp'` takes in both,
and leaves out a `.broken` file set aside and a write's temporary file.

- `columns` in `columns.json` is ordered. The first column is the leftmost on screen. A card naming
  a column the list does not have gets that column, after the listed ones.
- `column` is the name of the card's column; a card without one is in Backlog. `order` is a number,
  and the cards of a column go top to bottom by it, then by `id`. A move gives the moved card a
  number between its new neighbours and leaves every other file alone.
- Every board has a `Backlog` column, first unless someone moved it. A card
  nobody has chosen to work on waits there; `Todo` holds what has been picked.
  `board add` with no `--column` puts a card in Backlog.
- The `Ship` column is not an ordinary one. Moving a card into it asks the
  Dashboard app to make a git worktree for that card, check out a branch named
  after it, and start an agent in one of the project's panes. Put a card there
  only when you mean to start it.
- A shipped card's column follows its pull request, and the app moves it: into
  `Doing` when its agent starts, into `Review` when the pull request on its
  branch opens, into `Done` when it merges, back to `Doing` when it closes
  unmerged, with one comment naming the pull request each time. An agent working
  a card does not move it; it records the number with `board set <id>
  --pull-request <n>`, which is what starts the review once it goes quiet. Into `Review`, the app throws that card's worktree
  away and makes a fresh one on the pull request's branch with an agent
  reviewing it.
- A card's column on the `main` branch says what has been merged, and `Review`
  is the one exception — a card there has a pull request open and nothing has
  checked it. On a board git tracks, the `board` command writes the card on
  `main` itself, from the project or any worktree, and brings the project's
  checkout up to it; a worktree's own board is its branch's and is left alone.
- `id` is a UUID, and no two cards may share one; it is also the file's name. Keep it stable when you
  edit a card. A card written without one takes its file's name, and one with an id another card
  already used is given a fresh one the next time the app reads the board.
- A card file that is not JSON is moved aside as `<id>.json.broken` the next time the app reads the
  board, so nothing overwrites it.
- `title` is one line. A card with no `title`, or a blank one, is dropped when the app reads
  the file.
- `notes` is the card's description, free text over as many lines as you like. `e` opens it.
- `priority` is one of `urgent`, `high`, `medium`, `low`. Anything else, or nothing, reads as
  `medium`. It colours the card's left edge, and `s` sorts a column by it, urgent first.
- `parent` is the `id` of another card, or `null`. It is the only thing that makes a card a
  subtask: subtasks are ordinary cards that live in whatever column they are in, and a parent keeps
  no list of its children. A `parent` naming a card that is not on the board, or a ring of cards
  that are each other's ancestors, is reset to `null` when the app reads the file.
- `createdAt` and `updatedAt` are ISO dates, or absent. Absent means unknown, not now: a card written
  before these fields existed, or written by hand without them, stays that way and the app never
  fills them in on read. `updatedAt` moves when one of that card's own fields changes, and when the
  card moves to another column — reordering a column leaves it alone.
- `comments` is the card's comment trail, oldest first, or absent when nothing has been said. Each
  entry is `{ "at": <ISO date>, "body": <text> }`; `at` may be absent, and an entry with a blank
  `body` or no `body` is dropped when the app reads the file. It is append-only — write to it with
  `board comment` and never by rewriting what is there. `notes` is the card's description and is
  edited in place; everything said about the card over its life goes here instead, so recording a
  finding cannot take out what somebody else wrote.
- `branch` is the git branch the work is on, or absent. `pullRequest` is the pull request's number,
  a whole number above zero written without the `#`, or absent. A ship writes the branch and the app
  finds the pull request from it through `gh`; `b` edits the branch and `r` the pull request.

## The `board` command

Every pane the Dashboard app opens carries `DASHBOARD_BOARD`, the path to a command that edits the
board of the project you are in — any depth inside it, not only its root. It goes through the same
code the app does, so a card it writes is a card the app wrote.

    board — the Dashboard board of the project you are in

      board list
      board show <id>
      board add "<title>" [--column <name>] [--priority <level>] [--notes "<text>"]
      board move <id> <column>
      board ship <id>
      board review <id>
      board set <id> [--branch <name>] [--pull-request <number>] [--priority <level>] [--notes "<text>"]
      board comment <id> "<text>"

    Levels: urgent, high, medium, low. An empty --branch or --pull-request clears the field. Any of them
    takes --project <name|aka> to work on that project's board, from ~/.dashboard/projects.yaml, instead
    of the board of the folder you are in.

    ship, review and a move into Ship or Review ask the running app, starting it when none answers: a move
    into Ship ships the card to an agent in a worktree, and one into Review starts its review loop. ship
    and review start them without a move; review is how to start a loop with the review.autoLoop setting
    off. On a worktree's board a move is only a move. Everything else edits the board's files alone.

    A board git tracks is read and written on origin's default branch, from the project or any worktree,
    and the project's checkout is brought up to it. Offline, it is written here, with a warning.

    A card that will not be done is kept, not deleted: `board move <id> Cancelled` puts it in the
    Cancelled column after Done, which starts nothing.

    --notes replaces the card's description. To record what you found, use `comment`: it appends to the
    card's trail and takes nothing away. `show` prints one card with its description and its trail.

Run it as `node "$DASHBOARD_BOARD" <command>`. `list` prints the column, the priority, the id and
how many comments each card has — the id is the one `show`, `move`, `set` and `comment` want.
`show` prints one card in full, including its comment trail, which is the part `list` has no room
for.

Prefer it to editing this file by hand: a refusal comes back as a message and nothing is written,
where a hand edit that gets a field wrong is repaired silently on the next read.

Edit the files directly if you like — the app notices. It watches this folder while a board is on
screen, so a card moved from the command line or by hand shows up where you are looking, with the
selection left on the card it was on. The app rewrites a card's whole file when it changes that card
and drops any field not listed above.
