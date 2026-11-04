# Panes: decisions

Settled questions. Read the entry before re-litigating it.

## panes-decision-1: The shells live in a small pty host run by node, not in tmux

Every pane's pty used to be a node-pty child of Electron main, so a quit, a
crash or the restart an update needs killed every shell (review R1, 2026-11-01).
They now run in the pane host: `pane-host-entry.js`, started detached through
the user's login shell as `node pane-host-entry.js <socket>`, holding the ptys
with the same node-pty the app ships. The app talks to it over a unix socket in
its user data (`pane-host/panes-1.sock`, folder mode 0700; a named pipe on
Windows, below), one JSON message a line. The app speaks first, with `hello`,
and the host says nothing to a connection until it has. Then it is told every
shell still running with its screen, and `spawnProject` puts each back in its
pane before any Claude resume runs.

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
  host's protocol is thirteen message types, and the screen it replays comes from
  `pane-screen-copy.ts`, which the remote host already uses.

Two things made the host possible without changing the build. node-pty's binary
is N-API, so the copy in `app.asar.unpacked` loads under the system `node`
(`scripts/node-pty-built.mjs` says the same). Electron's own binary could not be
the host: the `RunAsNode` fuse is off in `forge.config.ts`, and turning it on to
run the app's binary as node was not worth it.

Windows has neither a POSIX login shell nor socket files. There the app starts
`node pane-host-entry.js <pipe> <token file>` straight, since a Windows app is
handed the PATH the user set, and the socket is a named pipe,
`\\.\pipe\dashboard-panes-1-<hash of the token>`, the way the `session` command's is
(`session-socket.ts`). Its access is the pipe default, not a 0700 folder, and
that default lets every user on the machine open it for reading. Such a
connection cannot write the `hello`, so it hears no screen and does not turn
the app away as `busy`.

The other direction is what the token is for. On Windows the app is the one
connecting, and any user can create a pipe of a name nobody holds and answer as
the host: the app would send every pane's environment and every keystroke to
them. A name is no secret, since any user can list `\\.\pipe\`, so the name
only has to differ per user data; the secret is the token itself, 16 random
bytes made on the first launch and kept in `pane-host/pipe-token`, which a
Windows profile does not let other users read. The host is handed the file's
path, not the token, so it is on no command line. The app's `hello` carries a
random nonce, the host answers with an HMAC of it keyed by the token, and the
app sends nothing more and adopts nothing until that checks out. A `busy`
carries the proof too, since another Dashboard holding the host is told so by
the host itself. Something that fails it, or answers `busy` without it, closes
before answering, or says nothing for ten seconds, hears only the `hello`; the
app runs its shells itself this run and writes a new token, so the next launch
uses a name that was never listed. Silence ends the wait on a mac or Linux too,
with no new token, so a hung host cannot keep every project from opening. It
does not launch a host on the new name the same run: that costs one run's panes
their survival, against retargeting a client already reaching for a name.

The token is written only when the file is missing or holds no token. It is
written whole to a file beside it and then linked into place, which fails if a
second launch got there first, so that launch keeps the first's token and no
launch ever reads a half-written file and takes it for a damaged one. A new
token (a renewal) is renamed over the old file the same way. A new token while a
host runs on the old name would leave that host's shells running unseen and
resume their Claude conversations a second time. A read failing any other way
(a scan holding the file) is no host this run, not a new token.

On a mac or Linux there is no nonce: the 0700 folder is what keeps others out,
and a version 1 host already running there, which answers no proof, keeps its
panes through the update.

The protocol stayed at version 1 when `hello` came in. An older host drops it
and answers anyway, so an update keeps the running host and its panes; a bump
would have left that host running unseen and resumed every Claude conversation
a second time beside it. The cost lands on a downgrade: an older app meeting
this host says no `hello` and waits at start until it is quit.

When no host answers (no `node` where the host would start, a socket path too
long), the app runs ptys itself as before, and the status bar says the
shells die with it this run. If the host dies mid-run every pane it held reads as
exited and new panes run in the app.

Not kept: the editor, because nvim's socket is named after the project's page
(`nvim-remote.ts`) and a project can come back on another one. It is spawned in
the app, not the host, so it dies on quit instead of holding its buffers until
the next launch. A second Dashboard on the same user data (a development build
beside the installed app) is turned away by the host with `busy` while the
first is connected, and runs its shells itself. The Claude
screens run in the app and still stop on quit. workflow-rule-1 stays: a restart
still stops every Claude screen and every kept shell's `DASHBOARD_SOCKET` goes
stale (README, Open questions).
