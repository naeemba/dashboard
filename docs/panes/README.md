# Panes

A project's terminals: the main session in a column on the left and the worker
panes in a scrolling list on the right. Each pane is an xterm over a pty that
the pane host runs, a node process outside the app, so the shell outlives a
quit, a crash or an update (panes-decision-1). What a pane printed is read for
links, bells, a name and whether it is busy.

## Files

Folders: `src/main/panes/`, `src/shared/panes/`, `src/renderer/panes/`.

- Pane: `pane.ts`, `pane-actions.ts`, `pane-channels.ts`, `pane-layout.ts`,
  `pane-openers.ts`, `pane-reading.ts`, `pane-screen-copy.ts`, `pane-sends.ts`,
  `terminals.ts`, `jumps.ts`
- Shell and process: `shell.ts`, `process-tree.ts`, `shell-directory.ts`,
  `shell-directory-lookup.ts`, `working-panes.ts`, `free-pane.ts`, `waiting.ts`
- Pane host: `pane-host-protocol.ts`, `pane-host-server.ts`,
  `pane-host-entry.ts`, `pane-host-client.ts`, `pane-shell.ts`, `pane-shells.ts`,
  `adopted-pane.ts`, and `vite.pane-host.config.ts` at the root
- Links in output: `links.ts`, `wrapped-links.ts`, `print-widths.ts`

## Scenarios

- Given a pane you are not looking at, when it rings its bell, then the pane is marked and a notification click takes you to it.
- Given a link wrapped onto the next row, when you click it, then the whole link opens in the browser.
- Given a worker pane is focused, when you zoom it, then it fills the page, and zooming again puts the layout back.
- Given a pane on Linux, when you press Ctrl+Shift+C and Ctrl+Shift+V, then the selection is copied and the clipboard pasted.
- Given a pane link on the Claude screen, when you click it, then the page holding the pane comes forward with the pane focused, the way a notification click lands (see [chat](../chat/README.md)).
- Given a shell that has finished what it ran, when anything asks whether the pane is busy, then one answer says it is free.
- Given a worker pane running a job, when the app quits, crashes or is updated and opens again, then the pane comes back with the same shell, its screen and the job still running.
- Given a pane the pane host kept, when its project is closed or the pane is closed, then its shell is killed.
- Given no `node` on the login shell's PATH, when the app starts, then the status bar says shells die with the app this run, and the panes work as before.
- Given no pane host this run, when you close the window, then the quit question says every shell is killed.
- Given the installed app running, when a development build on the same user data starts, then the installed app keeps its panes and the development build runs its shells itself.
- Given the editor open, when the app quits, then nvim exits with it.

## Open questions

- A kept shell's `DASHBOARD_SOCKET` names the session socket of the run that
  started it, which is gone after a restart: `dashboard pane …` from that pane
  answers that the app has quit until the pane is restarted.
- A project not reopened after a restart leaves its kept shells running unseen
  until they exit or the machine restarts.
- An app whose protocol version differs from the running host's starts a host of
  its own; the old host's shells run on unseen.

- A job put in the background is invisible to the busy check; `runsAProgram`
  in `pane-reading.ts` says why.
