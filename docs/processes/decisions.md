# Processes: decisions

Settled questions. Read the entry before re-litigating it.

## processes-decision-1: One agent may hold 6G before reclaim and 8G before it is killed

`AGENT_MEMORY_HIGH` and `AGENT_MEMORY_MAX` in `scope.ts`. The starting values
from the card: on the user's 31Gi laptop, with about 20 sessions using 15.4G
between them, a session averages under 1G, and the one that hurt was a single
12G jest run. At 6G the kernel starts reclaiming from that one agent, slowing
it rather than the desktop; at 8G it is killed rather than pushing the machine
into swap. Two agents at their high mark still fit under the slice's 16G. Raise
them in `scope.ts` if a real workload is killed at 8G.

## processes-decision-2: The slices' caps live in their unit files, written once

agents.slice: `CPUWeight=30` (a third of a desktop process's default 100, so a
build yields to the window you are typing in), `MemoryHigh=16G`,
`MemoryMax=20G`, `MemorySwapMax=6G`: every agent together leaves the desktop
11-15G of the 31Gi and most of swap. panes.slice has no caps: it is the user's
own shells, grouped so they show apart.

They are unit files rather than `-p` flags on each scope because they are per
slice, and a file is what the user can tune with a drop-in without a build.
Written only when missing (processes-rule-2). Neither name has a dash: systemd
reads a dash in a slice name as nesting, and `dashboard-agents.slice` would sit
under an implicit `dashboard.slice`.

## processes-decision-3: Main decides the scope; the pane host only runs it

The spawn request carries the pane's own command (`file`, `args`) and, beside
it, the scoped one with its unit name (`scope`). The host runs `scope` when
there is one, and reports the pane's own command with the unit for a shell it
kept.

Deciding in the host was the other way, and it costs three things: the host
would need its own check of systemd, its own log line and its own random names,
none of which main could see; adoption reads a survivor's `args` as the pane's
command, so the host would have to keep two commands anyway; and main would
learn the unit only from a new message back. With main deciding, an older host
that ignores `scope` just runs the pane unscoped.

## processes-decision-4: Every pane waits on the check, and a pane's kind is read off its command

Projects at launch, the manager's panes, every session-command answer, every
Claude screen's session and every manager task wait on `scopes.ready` beside
the pane host. The check is two probes, plus a
daemon-reload the first time, tens of milliseconds; not waiting left the panes
restored at launch unscoped half the time.

Whether a pane is an agent is `runsAnAgent` on its command, the one predicate
that already says so (pane.dispatch's terminal half is the only thing that gives
a pane a command of its own), rather than a kind carried from pane.dispatch,
pane.open and pane.restore, which would be a second copy of the same answer to
drift from it. A Claude screen's agent runs in the screen host, not the pane:
the shell under it is a plain one.

## processes-decision-5: Main picks a session's scope, and the SDK's spawn only runs it

A Claude screen's session asks for its scope in `chat-sessions.ts` when it
starts, with the CLI's path as the command, and sends the answer with the
session: as data beside the options, since the screen host is another process
and a function cannot cross its socket. `withScope` in `claude-process.ts`, on
both sides, gives the SDK a `spawnClaudeCodeProcess` that runs systemd-run's
options up to its `--`, then whatever command and flags the SDK built. With no
scope it leaves the SDK's own spawn in place.

Asking inside the spawn hook was the other way: it would need the screen host
to have its own systemd check and its own names (processes-decision-3's reasons),
and the unit would not be known until the SDK chose to start the process.
