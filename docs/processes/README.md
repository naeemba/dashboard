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

Now every pane's shell, every Claude the Agent SDK starts and every one of the
manager's tasks starts in a scope of its own:

- An agent's pane (Claude Code run as the pane's command, as pane.dispatch's
  terminal half starts it) runs in `agent-<project>-<pane>-<random>.scope` under
  `agents.slice`, with its own `MemoryHigh=6G` and `MemoryMax=8G`
  (processes-decision-1).
- A Claude screen's session, a page's main or a worker screen, runs in
  `agent-<session name>-<random>.scope` under `agents.slice` with the same caps:
  `agent-main-dashboard-k4f2.scope` for dashboard's main, the worker's own name
  for a worker screen. Main picks the scope when the session starts and the
  SDK's spawn runs the CLI through it, in the app or in the screen host
  (processes-decision-5). A session that fails ends with the last of the CLI's
  stderr (or systemd-run's refusal) in its error, as an unscoped one does.
- A command the manager runs across projects runs in
  `task-<project>-<random>.scope` under `agents.slice` with an agent's caps: a
  build or a test suite is what grows to an agent's size.
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
stops or reads a scope later finds it again. A session's and a task's unit is
not kept yet: a session the screen host already holds keeps the unit it first
started in, not the one main asks for again, so the card that stops scopes
records the unit the host answers with.

When a pane closes, by its close key or `pane release`, pane.close kills its
shell and then runs `systemctl --user stop --no-block <unit>`, so a dev server
or watcher the shell detached goes with it instead of outliving the pane.
systemd sends SIGTERM to what is left and SIGKILL after its stop timeout;
`--no-block` keeps a program that ignores SIGTERM from holding the close. A
scope already gone (exit 5, "not loaded") is taken as stopped. Any other
failure still closes the pane, and the close's answer names the unit left
running. A pane with no scope recorded (unscoped, a mac, Windows) stops
nothing.

Two other ways a pane's shell goes stop its scope the same way. Closing a
project (project.close) reads the scope of every pane it has, the editor's
included, drops the panes and then stops each scope; a unit it could not stop
is named after `closed <project>` and is a warning in the log, since the close
key shows only a refusal. A dispatch that starts a pane's shell over
in place (a terminal agent into a pane that had a shell, or a screen whose
shell had to move folder) stops the old shell's scope once the new shell has
its own; each start is named afresh, so the stop never reaches the new one. A
failure there is a warning in the log, since the dispatch has already
answered.

At launch the app checks once that `systemd-run` is installed and that
`systemctl --user is-system-running` answers that the manager is up (`degraded`
counts: most desktops are). Until it has answered, and for the whole run if it
says no, every pane starts unscoped, with one warning in the log saying why.
Every pane waits on the check the way it waits on the pane host, and every
session and task waits on it too, so nothing started at launch is unscoped for
being early (processes-decision-4).

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
- The edge: `launch-scopes.ts` (the probes, the slice files, daemon-reload,
  stopping a pane's scope), `spawn-scoped.ts` (the one spawn a task and the
  SDK's Claude start through)
- The stop: `src/main/actions/pane/close.ts` (which unit, and when),
  `src/main/actions/project/close.ts` (every pane's of a closed project),
  `src/main/actions/pane/pane-actions.ts` (`shellIn`, a shell started over)
- The SDK's Claude: `src/main/chat/claude-process.ts` (which binary, and its
  spawn routed through the scope)
- The slices: `install-slices.ts`, the action and both unit files' text
- The guard: `process-starts.test.ts` (processes-rule-1)

## Scenarios

- Given Linux with a user manager, when an agent is started in a pane, then
  `systemctl --user status 'agent-*'` lists its scope under agents.slice with
  MemoryHigh 6G and MemoryMax 8G.
- Given the same, when a terminal or the editor opens, then its shell is in a
  `pane-*.scope` under panes.slice.
- Given the same, when a page's Claude screen starts its session, then
  `systemctl --user status 'agent-main-*'` lists the CLI in its scope; a worker
  screen's CLI is in its own `agent-*` scope, started by the screen host.
- Given the same, when the command screen runs `pnpm test` in three projects,
  then each runs in a `task-<project>-*.scope` under agents.slice and goes
  away when it ends.
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
- Given an agent pane that ran `sleep 1000 &` and disowned it, when the pane is
  released or closed, then the sleep is gone and its scope is inactive.
- Given a project whose pane ran `sleep 1000 &` and disowned it, when the
  project closes, then the sleep is gone and the pane's scope is inactive.
- Given a shell pane that ran `sleep 1000 &` and disowned it, when an agent is
  dispatched into it as a terminal, then the sleep is gone, the old `pane-*`
  scope is inactive, and the agent runs in a new `agent-*` scope.
- Given a pane whose scope already ended, when it closes, then it closes as any
  pane does and nothing is reported.

## Open questions

- A pane host started by an older build ignores the scope on the spawn request:
  panes stay unscoped until that host exits, once every pane it holds is closed.
- A screen host started by an older build ignores the scope main sends with a
  worker screen: that host's sessions run unscoped until it exits, once no app
  is connected and none of its sessions runs.
- A session's and a task's scope is not stopped by the app: a task's ends with
  its command, a session's with its CLI, and what either detached outlives it.
- A pane started again after its shell exited (`pty:restart`) gets a new
  scope; what the dead shell detached stays in the old one until it ends.
- A shell the pane host kept that pane.restore does not take back is killed,
  but its scope is not stopped: what it detached runs until it ends or you log
  out.
- Only this run's names are checked before one is handed out. A name a previous
  run's pane host still holds collides about once in 36^4 starts of the same
  pane; that pane's `systemd-run` then exits 1 ("already loaded"), and Enter
  starts it again under a new name.
