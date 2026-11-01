# Drawer

A drawer on the left of a page listing the project's docs, as a tree, and the
Claude conversations the app started for it; on the manager's page, the markdown
under `~/.dashboard` and `~/.claude` and the manager's own conversations. Open, it pushes the page to
its right; closed, it takes no room. A doc opens rendered in a full-screen viewer.

## Files

Folders: `src/main/drawer/`, `src/renderer/drawer/`, `src/shared/drawer/`.

- Lists and resume: `docs-list.ts`, `drawer-ipc.ts`, `drawer.ts`
- On screen: `drawer-rows.ts`, `drawer-view.ts`, `doc-viewer.ts`, `drawer.css`
- The viewer reuses the Claude screen's `chat-markdown.ts` and the sheet of
  `viewerOverlay` in `overlay.ts`; neither is this feature's
- The session index it reads is the workers feature's: `session-index.ts`,
  `session-index-store.ts` (see [workers](../workers/README.md))

## Scenarios

- Given any page, the manager's included, then the drawer's button, its icon alone with "Docs & sessions" as its tooltip, is at the left of the title row, so the row does not move between tabs.
- Given a project page, when you click the drawer's button at the left of the title row or press Ctrl+Shift+D, then the drawer opens at the left and the page moves to its right, the panes resized to the room left.
- Given the drawer is open, when you press Escape, Ctrl+Shift+D or the button, then it closes and takes no room at all.
- Given the drawer, when you type, then the docs and the sessions are both narrowed to what matches; the arrows walk the rows and a click does what Enter does on the row it lands on.
- Given the drawer with an empty filter, then docs/ is a tree: the files at its top, then its folders, closed; a folder opened stays open the next time the drawer opens.
- Given a closed folder row, when you press Right or Enter, then it opens; Right again steps to its first row. Given an open folder, when you press Left or Enter, then it closes; Left on a row inside one steps to that folder.
- Given a doc inside a closed folder, when you type part of its path, then it is listed, flat, by its whole path; Left and Right move the caret in the filter.
- Given a doc row, when you press Enter or click it, then the doc is shown rendered as markdown, full screen, over the drawer: tables, highlighted code, and images the doc points at inside the project.
- Given the doc viewer, when you press the arrows or the Page keys, then the doc scrolls; when you press Escape or click the dark margin, then the viewer goes and the keyboard is back in the drawer's filter.
- Given the doc viewer, when you press Enter or click its Edit row at the top, then the viewer and the drawer go and the file opens in the project's nvim.
- Given a link in the doc viewer, when you click it, then it opens in the browser; a link to another doc is not followed.
- Given a session row, when you press Enter, then a new worker pane opens in the folder the session ran in and `claude --resume <id>` is typed into it; the page goes to the terminals view with the keyboard in that pane; a busy pane is never used.
- Given the drawer, when you click a row that leaves it open (Load more, a refused resume), then the keyboard stays in the drawer's filter box.
- Given a session still running in a pane or on the Claude screen, when you press Enter on it, then it is refused and the status bar says where it runs.
- Given the Claude screen's session has ended, or has not started yet, when you press Enter on the conversation the Claude screen will resume, then it is refused as running on the Claude screen.
- Given a conversation the drawer resumed into a worker pane, when you pick it in the Claude screen's `/resume`, then it is refused and the status line says which pane runs it.
- Given a session row, when you press F2, then a box asks for its new name; an empty one is refused.
- Given more than fifty sessions, when you reach the Load more row and press Enter, then fifty more are listed.
- Given the manager page, when you open the drawer, then its docs are two closed folders, `.dashboard` and `.claude`; opening one reads that folder alone, its markdown files and its folders, and the filter finds only files in folders read so far.
- Given the manager page, when you press Enter on a doc, then it is shown in the viewer with no Edit row, and Enter or Escape closes it; the manager has no nvim.
- Given the manager page, then its sessions are the manager's own conversations, or none with a line saying so.
- Given a read asked from the manager page for a file that is not markdown under `~/.dashboard` or `~/.claude`, then it is refused, answered as a value.

## Open questions

- A link from one doc to another prints as text in the viewer: the renderer
  keeps only links that open in the browser (drawer-decision-2).
- A Claude typed into a shell by hand is not the app's launch and is not
  listed (drawer-decision-1).
- On the manager's page the filter does not find a doc in a folder never
  opened (drawer-decision-3).
