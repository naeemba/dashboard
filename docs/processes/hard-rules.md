# Processes: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## processes-rule-1: A process that runs as long as a pane or an agent starts in its scope

Every file that can start a process, by importing `node:child_process` or
`node-pty`, is named in `src/main/processes/process-starts.test.ts` under the
reason it may: it starts through the scope, it starts the app or one of its
hosts, or it is a short call (git, `ps`, a probe) that ends in seconds. A new
file fails the test. A card that moves a site behind the scope deletes its row;
a row is never added without its reason.

What breaking it looks like: a new runner spawns `pnpm test` with `spawn`
directly. It runs in Dashboard's own scope, uncapped, beside the main process.
Its 12G jest run swaps the desktop for two minutes, and `systemd-cgtop` shows
only `app-dashboard-<pid>.scope` growing, with nothing saying which session
started it, which is the freeze this feature exists to end.

## processes-rule-2: A slice unit that is there is never written over

The launch writes `agents.slice` and `panes.slice` only when missing. A user
who raised `MemoryMax` in the file by hand, or in a drop-in, keeps it.

What breaking it looks like: the app rewrites the file at every launch. You
raise agents.slice's MemoryMax to 24G for a heavy week; the next launch puts it
back to 20G with nothing on screen saying so, and the build you started that
afternoon is killed at 20G.
