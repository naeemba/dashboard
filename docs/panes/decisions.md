# Panes: decisions

Settled questions. Read the entry before re-litigating it.

## panes-decision-1: The shells live in a small pty host run by node, not in tmux

Every pane's pty used to be a node-pty child of Electron main, so a quit, a
crash or the restart an update needs killed every shell (review R1, 2026-11-01).
They now run in the pane host: `pane-host-entry.js`, started detached through
the user's login shell as `node pane-host-entry.js <socket>`, holding the ptys
with the same node-pty the app ships. The app talks to it over a unix socket in
its user data (`pane-host/panes-1.sock`, folder mode 0700), one JSON message a
line. On connecting it is told every shell still running with its screen, and
`spawnProject` puts each back in its pane before any Claude resume runs.

The review named two ways. tmux in control mode (`tmux -C`) was weighed and
turned down:

- It is a dependency the app does not have and a mac does not ship. The host
  needs only `node`, which every pane already needs for `DASHBOARD_BOARD`.
- tmux is a terminal between the shell and xterm. Programs see
  `TERM=tmux-256color` and tmux answers their terminal queries, so what a pane
  reads for links, the title and the bell is no longer the program's own
  bytes, and the busy check's foreground reading becomes a `display-message`
  round trip per pane.
- Control mode is a protocol of its own to parse (`%output` with octal escapes,
  `send-keys -H`, `refresh-client -C` per pane, `capture-pane` to redraw). The
  host's protocol is five message types, and the screen it replays comes from
  `pane-screen-copy.ts`, which the remote host already uses.

Two things made the host possible without changing the build. node-pty's binary
is N-API, so the copy in `app.asar.unpacked` loads under the system `node`
(`scripts/node-pty-built.sh` says the same). Electron's own binary could not be
the host: the `RunAsNode` fuse is off in `forge.config.ts`, and turning it on to
run the app's binary as node was not worth it.

When no host answers (no `node` on the login shell's PATH, a socket path too
long, Windows), the app runs ptys itself as before, and the status bar says the
shells die with it this run. If the host dies mid-run every pane it held reads as
exited and new panes run in the app.

Not kept: the editor, because nvim's socket is named after the project's page
(`nvim-remote.ts`) and a project can come back on another one. The Claude
screens run in the app and still stop on quit. workflow-rule-1 stays: a restart
still stops every Claude screen and every kept shell's `DASHBOARD_SOCKET` goes
stale (README, Open questions).
