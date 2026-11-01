# Usage

Token usage per project and per pane, read from Claude Code's own session
logs: this five-hour window, this week and all time, with a trend.

## Files

Folders: `src/main/usage/`, `src/shared/usage/`, `src/renderer/usage/`.

- `usage.ts`, `usage-store.ts`, `usage-sweep.ts`, `usage-thread.ts`,
  `usage-worker.ts`, `usage.css`
- `vite.usage-worker.config.ts` at the root builds the worker beside main.

The logs are read on a worker thread of its own (`usage-worker.ts`), which
keeps each file's counts across sweeps and sends back only the snapshot. The
first sweep after a launch reads every log whole: 4.5 GB took 14 to 18 s on
one machine, and on main's thread it held every pane up for up to 160 ms at a
time. `usage-thread.ts` is main's side: it starts the thread, sends each
sweep's open projects and panes, and rejects a sweep whose thread died, so the
next sweep starts a new one. The counts are not saved between launches, so
every launch reads everything again, off main's thread.

## Scenarios

- Given Claude Code has written session logs for a project, when the sweep runs, then the manager's row shows its five-hour, week and all-time totals.
- Given a pane runs Claude Code, when its replies cost tokens, then the pane's own figure moves.
- Given the logs are read, when the sweep runs, then nothing in them is written to.
- Given years of logs, when the app launches, then typing and pane output do not stall while the first sweep reads them.
