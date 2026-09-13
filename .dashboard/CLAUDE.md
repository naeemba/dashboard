# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B.

## board.json

    {
      "columns": [
        {
          "name": "Todo",
          "cards": [
            {
              "id": "0f6a2c5e-...",
              "title": "Fix the resize race",
              "notes": "",
              "priority": "high",
              "parent": null,
              "createdAt": "2026-09-08T09:12:44.017Z",
              "updatedAt": "2026-09-08T09:12:44.017Z",
              "branch": "fix-resize-race",
              "pullRequest": 14
            }
          ]
        }
      ]
    }

- `columns` is ordered. The first column is the leftmost on screen.
- The `Ship` column is not an ordinary one. Moving a card into it asks the
  Dashboard app to make a git worktree for that card, check out a branch named
  after it, and start an agent in one of the project's panes. Put a card there
  only when you mean to start it.
- A card's column on the `main` branch says what has been merged. While work
  is in flight the card's column lives on that work's own branch, and arrives
  here when the pull request does.
- `cards` is ordered. The first card is at the top of its column.
- `id` is a UUID, and no two cards may share one. Keep it stable when you edit a card. A card
  written without one, or with an id another card already used, is given a fresh one the next time
  the app reads the file.
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
- `branch` is the git branch the work is on, or absent. `pullRequest` is the pull request's number,
  a whole number above zero written without the `#`, or absent. Both are typed in — `b` edits the
  branch and `r` the pull request — and nothing fetches or refreshes them.

## The `board` command

Every pane the Dashboard app opens carries `DASHBOARD_BOARD`, the path to a command that edits the
board of the project in the current directory. It goes through the same code the app does, so a card
it writes is a card the app wrote.

    node "$DASHBOARD_BOARD" list
    node "$DASHBOARD_BOARD" add "Fix the resize race" --priority high --notes "what goes wrong"
    node "$DASHBOARD_BOARD" move 0f6a2c5e-... Done
    node "$DASHBOARD_BOARD" set 0f6a2c5e-... --branch fix-resize-race --pull-request 14

`list` prints the column, the priority and the id of every card, which is where the id for the other
three comes from. `add` takes `--column`, `--priority` and `--notes`; `set` takes `--branch`,
`--pull-request`, `--priority` and `--notes`, and an empty value clears a field. Run it with no
arguments for the whole of it.

Prefer it to editing this file by hand: a refusal comes back as a message and nothing is written,
where a hand edit that gets a field wrong is repaired silently on the next read.

Edit this file directly if you like — the app notices. It watches board.json while a board is on
screen, so a card moved from the command line or by hand shows up where you are looking, with the
selection left on the card it was on. The app rewrites the whole file on every edit and drops any
field not listed above.
