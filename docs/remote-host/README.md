# Remote host

A second screen: one Dashboard connects to another's session over a websocket
and draws the host's projects and panes as its own. The host owns which
projects are open; every screen's pages follow it.

## Reaching the host

The port in `host.port` opens on `127.0.0.1` only. A screen on another machine
reaches it through a tunnel and connects to the local end:

    ssh -L 7777:127.0.0.1:7777 the-host     # then connect to 127.0.0.1:7777

To listen on the network instead, write the interface into `settings.json` by
hand. The settings screen has no row for it, so it is never set by accident:

    "host": { "port": 7777, "bind": "0.0.0.0" }

`0.0.0.0` is every interface; one address, such as the host's Tailscale
address, opens only that one. The wire is plain `ws://`: see
remote-host-decision-3 before widening it. The log says which address it
listens on.

## Files

Folders: `src/main/remote-host/`, `src/shared/remote-host/`, `src/renderer/remote-host/`.

- Host: `remote-host.ts`, `host-gate.ts`, `host-token.ts`, `host-wiring.ts`,
  `screens.ts`, `session-replay.ts`
- Screen: `remote-client.ts`, `connect-flow.ts`, `pending-requests.ts`
- Both: `remote-protocol.ts`, `remote-ipc.ts`

## Scenarios

- Given only `host.port` is set, when the host starts, then it listens on `127.0.0.1` and a machine on the network cannot connect.
- Given `host.bind` is set in the file, when the host starts, then it listens on that interface.
- Given a hello with a token of a different length, when the host checks it, then it refuses the token without throwing.
- Given a screen connects, when its first frame is not a valid hello with the host's token, then the host reads nothing else from it.
- Given a screen joins mid-run, when it arrives, then it is shown the projects and every pane's recent output.
- Given two screens draw one pane, when they report sizes, then the shell gets the smallest columns and rows, the way tmux does.
- Given a screen opens a project, when the host pushes `projects:change`, then every screen's pages match the host's list.
- Given a screen asks the host for the folder dialog, when the host refuses, then that screen's status bar says to type the path on the host (errors-rule-2).
- Given a mac screen on a Linux host, when it reads its keys, then it keeps its own Cmd keys.
- Given the app is running, when it is launched again with `--remote`, then the running app joins the remembered host, once its window has restored.
- Given the window is already joined to the remembered host, when the app is launched again with `--remote`, then it stays joined: no second connect, no replay.
