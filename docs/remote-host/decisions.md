# Remote host: decisions

Settled questions. Read the entry before re-litigating it.

## remote-host-decision-1: The host owns the list of open projects

Two screens can open and close projects, so the renderer no longer decides what is open. Main does, and
pushes `projects:change` with the whole list; each renderer makes its pages match through
`pageMoves` in `page-reconcile.ts`. The reply to a renderer's own `projects:open` carries the same
list, so the push and the reply are idempotent whichever lands first. Settings stay on the screen that
shows them: a mac on a Linux host keeps its Cmd keys.

## remote-host-decision-2: The frame field stays `args`

Locals and parameters spell the word out (`channelArguments`), but the `args` field of a `Request` or
`Push` in `remote-protocol.ts` keeps its short name: a Dashboard on one machine talks to another that
may be older, and a renamed field would read as missing there. The same holds for the session socket's
`{ directory, args }` request and `PaneCommand.args`.

## remote-host-decision-3: The host listens on loopback unless the file says otherwise

A joined screen reaches every channel but a short denylist, `pty:input` and `task:run` among them, and
the wire is plain `ws://`. Listening on every interface handed a shell to anyone on the same café Wi-Fi
who saw one hello go by (docs/review/2026-11-01.md S1). So `host.port` alone opens `127.0.0.1`, and the
interface is `host.bind`, written in `settings.json` by hand and never offered on the settings screen:
widening it is a choice someone makes on purpose, not a row the arrow keys land on. A tunnel (SSH,
Tailscale's own address) is the supported way in from another machine. `wss://` for a network bind is
left for a later change: it needs a certificate the screen can trust, which is its own design. The
token is compared with `timingSafeEqual`, length first, because a `!==` refusal is faster the earlier
the wrong byte, and that difference is a way to guess it.
