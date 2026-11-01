# Remote host

A second screen: one Dashboard connects to another's session over a websocket
and draws the host's projects and panes as its own. The host owns which
projects are open; every screen's pages follow it.

## Files

Folders: `src/main/remote-host/`, `src/shared/remote-host/`, `src/renderer/remote-host/`.

- Host: `remote-host.ts`, `host-gate.ts`, `host-token.ts`, `host-wiring.ts`,
  `screens.ts`, `session-replay.ts`
- Screen: `remote-client.ts`, `connect-flow.ts`, `pending-requests.ts`
- Both: `remote-protocol.ts`, `remote-ipc.ts`

## Scenarios

- Given a screen connects, when its first frame is not a valid hello with the host's token, then the host reads nothing else from it.
- Given a screen joins mid-run, when it arrives, then it is shown the projects and every pane's recent output.
- Given two screens draw one pane, when they report sizes, then the shell gets the smallest columns and rows, the way tmux does.
- Given a screen opens a project, when the host pushes `projects:change`, then every screen's pages match the host's list.
- Given a screen asks the host for the folder dialog, when the host refuses, then that screen's status bar says to type the path on the host (errors-rule-2).
- Given a mac screen on a Linux host, when it reads its keys, then it keeps its own Cmd keys.
