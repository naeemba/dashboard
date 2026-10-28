# A second screen: the mac window onto the laptop's session

The laptop has no battery and lives on the desk. The mac went to someone
else, but comes back to the couch now and then. Dashboard runs on the laptop
and holds the shells, the Claude Code conversations, the boards and the
notes. The mac should open the same Dashboard window, see what the laptop is
doing, and carry on from the couch, without a step per pane or per project.

Scope here: one host (the laptop), one remote client (the mac), home network.
A server as host, Tailscale, or a browser client each come after and reuse
the protocol unchanged. Nothing here forecloses them.

## 1. Shape

- **The laptop's app is the host.** No separate daemon. Its main process
  serves its own window as today and, when `settings.host.port` is set,
  also listens for one or more remote clients on a websocket.
- **The mac runs the same build.** In its Ctrl+S project list, one new row,
  `Connect to a host…`. Enter asks for `address:port` and the token. From
  then on the mac's main process is a relay: every bridge call the renderer
  makes is forwarded to the host, every push the host sends is relayed to
  the renderer. The renderer and `preload.ts` do not change. A `Disconnect`
  row in the same list ends it and returns the mac to its own projects.
- **Protocol.** The existing bridge channels, as JSON frames over one
  websocket:

  ```ts
  type Request = { id: number; channel: string; args: unknown[] };
  type Reply = { id: number; result?: unknown; error?: string };
  type Push = { channel: string; args: unknown[] };
  ```

  `src/remote-protocol.ts`, pure, tested: `encodeFrame`, `decodeFrame`,
  and the lists `HOST_CHANNELS` (served by the host) and `CLIENT_CHANNELS`
  (stay on the client, section 4). A channel in neither list is refused
  with an error reply, never silently dropped.
- **Dependency.** `ws` for both ends. Node has no websocket server, and a
  hand-written frame parser is more code than the whole feature.

## 2. One session, two screens

Today the renderer decides which projects are open and tells main. With two
windows that list must have one owner.

- **The host owns the page list.** `projects:open` and `projects:close` run
  on the host and then push `projects:change` with the full list of open
  projects, in slot order, to every connected screen and to the host's own
  window. Each renderer rebuilds its tabs from that list: a project it did
  not have gets a page, one that disappeared loses its page. The renderer
  stops assuming it is the only one calling open and close.
- **Per screen, not shared:** the active page, the selected pane, the mode,
  the scroll position, any open dialog. Two screens may look at different
  projects of the same session.
- **Pane size.** Every screen reports its size per pane as today. The host
  keeps all reports and gives the shell the smallest columns and rows among
  connected screens, like tmux. A screen that disconnects takes its report
  with it, and the shell is resized to what remains. `sizeOfPane` in
  `terminals.ts` grows a `smallest(sizes)` beside a test.
- **Scrollback.** The host keeps the last 256 KB of output per pane in a
  ring (`src/pane-ring.ts`, tested). On connect, before anything else, the
  client receives one `pty:data` per live pane holding that ring, then live
  output. The renderer already handles `pty:data`; nothing new on its side.
- **Session file.** `session.json` is the host's. The host writes it from
  its own page list and the host window's view. The remote client's
  `session:write` is accepted and ignored: a couch layout must not
  overwrite the desk's. `session:read` returns the live page list so a
  connecting screen opens on what is there.
- **Working panes, usage, markets, log, worktrees, tasks:** all host-side
  already. Their pushes fan out to every screen.

## 3. Connecting

- **Settings, host side:**

  ```ts
  host: { port: number | null; token: string };
  ```

  `port` null means do not listen. `token` is generated on first read when
  empty: 32 random bytes, base64url. Shown in the settings screen as a row
  with a `Copy` action so it can be pasted on the mac once.
- **Settings, client side:** `remote: { address: string; token: string }`,
  filled by the connect dialog, so the next launch offers `Reconnect to
  <address>` as the first picker row. Launching with `--remote` connects
  straight away.
- **Handshake.** First frame from the client is
  `{ channel: 'host:join', args: [token, version] }`. A wrong token closes
  the socket with code 4001 and the client shows `The host refused the
  token`. A different `package.json` version closes with 4002 and names
  both versions: the two apps must be the same build, since the protocol is
  the bridge itself.
- **Listening address.** All interfaces, so a Tailscale address later needs
  no change. The token is the guard. Plain text on the home wifi is the
  accepted risk for this scope; it is written down here so it is a choice
  and not an oversight.
- **Reconnect.** When the socket drops, the client keeps the page list it
  has, greys the status bar with `Reconnecting to <address>…`, and tries
  every two seconds. On success the rings are replayed into each pane
  after a clear, so nothing is doubled. Keystrokes typed while
  disconnected are dropped, not queued: a queued `rm` landing a minute late
  is worse than a lost keystroke.
- **Lid.** The laptop must not sleep on lid close; that is an operating
  system setting on the laptop, not the app's. Said in the settings row's
  help text.

## 4. What stays on the client

The screen you are looking at owns these:

- `link:open` opens in the client's browser.
- `notification:show` shows on the client. The click lands on the pane in
  the client's window.
- `settings:read` and `settings:write`: keys, font and theme are the
  screen's. A mac on a Linux host keeps its Cmd bindings.
- `host:connect` and `host:disconnect`.

Everything else goes to the host, including `scrollback:open` and
`file:open`: both carry what they need in their arguments (the text, the
link), and the editor they open into is the host's nvim, so the file must
be written where the host is.

`projects:open` with `null` today opens a native folder dialog. On the
remote client that would browse the mac, and relayed it would raise a dialog
on the host's desk. While connected, the client asks for a folder path on
the host in a text prompt instead, and the host refuses a `null` from any
remote screen.

## 5. Files

- `src/remote-protocol.ts` and test: frames, channel lists.
- `src/remote-host.ts`: the websocket server. Takes what main already holds
  (the `ipcMain` handlers' functions, not `ipcMain` itself) and serves them.
  The handlers in `main.ts`, `pane-channels.ts`, `log-ipc.ts`,
  `project-files-ipc.ts`, `session-store.ts` and `task-runner.ts` move
  from `ipcMain.handle(channel, fn)` to a `Map<channel, fn>` that one
  function registers with `ipcMain` and the host serves over the socket.
  Mechanical, the bodies do not change.
- `src/remote-client.ts`: the relay. One websocket, a pending-request map,
  the reconnect loop, the client-side channel table.
- `src/pane-ring.ts` and test.
- `src/screens.ts` and test: the set of connected screens, their pane sizes,
  `smallest`.
- `src/picker.ts`: the connect, reconnect and disconnect rows.
- `src/connect-dialog.ts`: address and token. Two inputs, `dir = 'auto'`.
- `src/settings.ts` and the settings screen: the `host` and `remote`
  fields and their rows.
- `src/help.ts`: the picker's blurb names the connect row.
- `src/main.ts` is at its 600-line ceiling. The handler map moves it
  shorter, not longer.

## 6. Errors

- Every failure shown to a person goes through `failureText`.
- A request with no reply after 10 seconds fails with
  `No answer from <address>`. The renderer sees a rejected promise as it
  would for a local failure.
- The host logs each connect and disconnect with the client's address as
  `info` entries in the log (kind `screen`).
- A host handler that throws replies with `failureText(error)` and the host
  keeps serving. One bad call never closes the socket.

## 7. Testing

- `remote-protocol.test.ts`: encode and decode round trips, refusal of an
  unknown channel, the handshake frames.
- `pane-ring.test.ts`: capacity, overwrite, replay order.
- `screens.test.ts`: smallest of several sizes, a screen leaving, no screens.
- `picker.test.ts`: the three new rows and when each appears.
- `settings.test.ts`: `host` and `remote` parse, token generated once.
- By hand, in the app: connect from the mac, type in a shell from both
  sides, resize both windows, open and close a project from each side, pull
  the wifi and plug it back, wrong token, mismatched version.

## 8. Not now

- Tailscale, a server host, a browser client: the same protocol, later cards.
- TLS or a login screen: not for the home network scope.
- A per-screen pane layout: screens share the host's layout on purpose
  (section 2).
- Queueing input across a disconnect.
- Mouse drag of cards between screens: the board file is the sync, as today.
