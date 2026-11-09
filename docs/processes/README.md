# Processes

Which systemd scope each process the app starts runs in, so the kernel, the OOM
killer and `systemd-cgtop` can tell one agent from another. Linux only; on a
mac, on Windows, or on a Linux machine without a user manager everything runs
as it did before.

## What it does

The user's measurement on 2026-11-09, with about 20 sessions open: RAM at
27 of 31Gi, swap at 15.4 of 16Gi, the desktop stalled on memory 10-15% of the
time and one two-minute freeze. Every agent and everything it started (claude,
node, vitest, jest, tsc, next) ran in the one scope the desktop launched
Dashboard into, 15.4G of RAM with no caps, so a 12G jest run swapped the whole
desktop and nothing could say which session it was.

Now every pane's shell starts in a scope of its own:

- An agent's pane (Claude Code run as the pane's command, as pane.dispatch's
  terminal half starts it) runs in `agent-<project>-<pane>-<random>.scope` under
  `agents.slice`, with its own `MemoryHigh=6G` and `MemoryMax=8G`
  (processes-decision-1).
- Every other pane, the user's own shells and the editor, and the plain shell
  under a Claude screen, runs in `pane-<project>-<pane>-<random>.scope` under
  `panes.slice`, uncapped.

Everything a pane's shell starts stays in its scope: `systemd-run --scope`
keeps the shell a child of the pane host, so the pty works as before, and a
test runner or a detached dev server an agent starts is counted against that
agent. Dashboard's main process, its window and the pane and screen hosts stay
where the desktop put them.

`systemd-cgls --user` shows it:

    agents.slice
    ├─agent-dashboard-2-k4f2.scope
    └─agent-shop-1-9xq0.scope
    panes.slice
    ├─pane-dashboard-0-a1b2.scope
    └─pane-dashboard-6-ohux.scope

The scope's full name is kept for each pane (`scopeUnits` in `pane-shells.ts`)
and travels with a shell the pane host keeps through a restart, so whatever
stops or reads a scope later finds it again.

At launch the app checks once that `systemd-run` is installed and that
`systemctl --user is-system-running` answers that the manager is up (`degraded`
counts: most desktops are). Until it has answered, and for the whole run if it
says no, every pane starts unscoped, with one warning in the log saying why.
Every pane waits on the check the way it waits on the pane host, so a pane
opened at launch is not unscoped for being early (processes-decision-4).

The same launch writes `agents.slice` and `panes.slice` into
`$XDG_CONFIG_HOME/systemd/user` (`~/.config/systemd/user`) when either is
missing, and runs `systemctl --user daemon-reload`, through the action
`processes.install-slices`. A file that is there is never written over: tune
the slice with a drop-in, `~/.config/systemd/user/agents.slice.d/override.conf`,
then `systemctl --user daemon-reload` (processes-decision-2).

## Files

Folders: `src/main/processes/`, `src/main/actions/processes/`.

- The decisions: `scope.ts` (the command and its unit name), `scope-support.ts`
  (whether scopes work here, and every name handed out)
- The edge: `launch-scopes.ts` (the probes, the slice files, daemon-reload)
- The slices: `install-slices.ts`, the action and both unit files' text
- The guard: `process-starts.test.ts` (processes-rule-1)

## Scenarios

- Given Linux with a user manager, when an agent is started in a pane, then
  `systemctl --user status 'agent-*'` lists its scope under agents.slice with
  MemoryHigh 6G and MemoryMax 8G.
- Given the same, when a terminal or the editor opens, then its shell is in a
  `pane-*.scope` under panes.slice.
- Given three agents each running a test suite, when you run `systemd-cgls
  --user`, then each agent's processes are in its own scope and Dashboard's main
  process is under neither slice.
- Given no `agents.slice` in `~/.config/systemd/user`, when the app starts, then
  it is written, the manager reloaded, and the log says so; given one edited by
  hand, it is left as it is.
- Given a mac, Windows, or Linux without `systemd-run`, when a pane opens, then
  it runs exactly as before; on Linux the log says once why it is unscoped.
- Given a worker the pane host kept through a restart, when the app opens again,
  then the pane knows its scope's name again.

## Open questions

- A pane host started by an older build ignores the scope on the spawn request:
  panes stay unscoped until that host exits, once every pane it holds is closed.
- The manager's tasks and the Agent SDK's sessions (main's Claude screen, the
  worker screens) are not scoped yet; the card after this one does them.
- A scope is not stopped when its pane closes, so a dev server an agent left
  running outlives the pane; a later card stops it.
- Only this run's names are checked before one is handed out. A name a previous
  run's pane host still holds collides about once in 36^4 starts of the same
  pane; that pane's `systemd-run` then exits 1 ("already loaded"), and Enter
  starts it again under a new name.
