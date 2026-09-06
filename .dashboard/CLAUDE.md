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
              "parent": null
            }
          ]
        }
      ]
    }

- `columns` is ordered. The first column is the leftmost on screen.
- `cards` is ordered. The first card is at the top of its column.
- `id` is a UUID. Keep it stable when you edit a card. A card written without one is given an id
  the next time the app reads the file.
- `title` is one line. A card with no `title`, or a blank one, is dropped when the app reads
  the file.
- `notes` is the card's description, free text over as many lines as you like. `e` opens it.
- `priority` is one of `urgent`, `high`, `medium`, `low`. Anything else, or nothing, reads as
  `medium`. It colours the card's left edge, and `s` sorts a column by it, urgent first.
- `parent` is the `id` of another card, or `null`. It is the only thing that makes a card a
  subtask: subtasks are ordinary cards that live in whatever column they are in, and a parent keeps
  no list of its children. A `parent` naming a card that is not on the board, or a ring of cards
  that are each other's ancestors, is reset to `null` when the app reads the file.

Edit this file directly if you like. The app re-reads it whenever the board is opened, so switch
away from the board and back to see your changes. The app rewrites the whole file on every edit and
drops any field not listed above.
