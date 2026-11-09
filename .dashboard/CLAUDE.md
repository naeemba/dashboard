# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B: `board/`, one
file per card, or `board.json` in a project the app has not written to since.

Change it with the board command, never by editing those files; an agent's edit of one is refused by
the `board guard` hook the app installs. Every pane the app opens carries `DASHBOARD_BOARD`, its path:

    node "$DASHBOARD_BOARD"          prints what it takes
    node "$DASHBOARD_BOARD" list     every card, with the id the other commands want
