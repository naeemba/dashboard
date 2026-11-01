# Drawer

A drawer over the left of a project's page listing the project's docs and the
Claude conversations the app started for it. Navigation only: every row jumps
somewhere, none of them holds content.

## Files

Folders: `src/main/drawer/`, `src/renderer/drawer/`, `src/shared/drawer/`.

- Lists and resume: `docs-list.ts`, `drawer-ipc.ts`, `drawer.ts`
- On screen: `drawer-rows.ts`, `drawer-view.ts`, `drawer.css`
- The session index it reads is the workers feature's: `session-index.ts`,
  `session-index-store.ts` (see [workers](../workers/README.md))

## Scenarios

- Given a project page, when you click the drawer's button at the left of the title row or press Ctrl+Shift+D, then the drawer opens over the page and the grid under it keeps its size.
- Given the drawer is open, when you press Escape, Ctrl+Shift+D or the button, then it closes and takes no room at all.
- Given the drawer, when you type, then the docs and the sessions are both narrowed to what matches; the arrows walk the rows and a click does what Enter does on the row it lands on.
- Given a doc row, when you press Enter, then the file opens in the project's nvim.
- Given a session row, when you press Enter, then a new worker pane opens in the folder the session ran in and `claude --resume <id>` is typed into it; the page goes to the terminals view with the keyboard in that pane; a busy pane is never used.
- Given the drawer, when you click a row that leaves it open (Load more, a refused resume), then the keyboard stays in the drawer's filter box.
- Given a session still running in a pane or on the Claude screen, when you press Enter on it, then it is refused and the status bar says where it runs.
- Given the Claude screen's session has ended, or has not started yet, when you press Enter on the conversation the Claude screen will resume, then it is refused as running on the Claude screen.
- Given a conversation the drawer resumed into a worker pane, when you pick it in the Claude screen's `/resume`, then it is refused and the status line says which pane runs it.
- Given a session row, when you press F2, then a box asks for its new name; an empty one is refused.
- Given more than fifty sessions, when you reach the Load more row and press Enter, then fifty more are listed.
- Given the manager page, when you press the drawer's key, then the status bar says to go to a project; the button is not shown there.

## Open questions

- There is no document pane yet, so a doc opens in nvim rather than rendered
  (drawer-decision-1).
- A Claude typed into a shell by hand is not the app's launch and is not
  listed (drawer-decision-1).
