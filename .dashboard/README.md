# .dashboard

Project state for the Dashboard app. `board/` holds this project's kanban board, one file per card
(`board.json` in a project the app has not written to since), and
`notes.md` — if it is here — is the project's page of free text, for what is not a card.

Commit it if the board belongs to the team; add `.dashboard/` to `.gitignore` if it is yours alone.

`CLAUDE.md` beside this file tells an agent how to change the board.
