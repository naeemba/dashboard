# Panes

A project's terminals: the main session in a column on the left and the worker
panes in a scrolling list on the right. Each pane is an xterm over a pty in
main; what it printed is read for links, bells, a name and whether it is busy.

## Files

Folders: `src/main/panes/`, `src/shared/panes/`, `src/renderer/panes/`.

- Pane: `pane.ts`, `pane-actions.ts`, `pane-channels.ts`, `pane-layout.ts`,
  `pane-openers.ts`, `pane-reading.ts`, `pane-screen-copy.ts`, `pane-sends.ts`,
  `terminals.ts`, `jumps.ts`
- Shell and process: `shell.ts`, `process-tree.ts`, `shell-directory.ts`,
  `shell-directory-lookup.ts`, `working-panes.ts`, `free-pane.ts`, `waiting.ts`
- Links in output: `links.ts`, `wrapped-links.ts`, `print-widths.ts`

## Scenarios

- Given a pane you are not looking at, when it rings its bell, then the pane is marked and a notification click takes you to it.
- Given a link wrapped onto the next row, when you click it, then the whole link opens in the browser.
- Given a worker pane is focused, when you zoom it, then it fills the page, and zooming again puts the layout back.
- Given a pane on Linux, when you press Ctrl+Shift+C and Ctrl+Shift+V, then the selection is copied and the clipboard pasted.
- Given a shell that has finished what it ran, when anything asks whether the pane is busy, then one answer says it is free.

## Open questions

- A job put in the background is invisible to the busy check; `runsAProgram`
  in `pane-reading.ts` says why.
