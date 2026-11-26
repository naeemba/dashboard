# Usage

Token usage per project and per pane, read from Claude Code's own session
logs: this five-hour window, this week and all time, with a trend.

## Files

Folders: `src/main/usage/`, `src/shared/usage/`, `src/renderer/usage/`.

- `usage.ts`, `usage-store.ts`, `usage-sweep.ts`, `usage-thread.ts`,
  `usage-worker.ts`, `usage-counts.ts`, `usage.css`
- Whether a prompt cache is warm: `cache-warmth.ts` (chat-decision-12)
- `vite.usage-worker.config.ts` at the root builds the worker beside main.

The logs are read on a worker thread of its own (`usage-worker.ts`), which
keeps each file's counts across sweeps and sends back only the snapshot. A
first sweep with nothing saved reads every log whole: 4.5 GB took 14 to 18 s on
one machine, and on main's thread it held every pane up for up to 160 ms at a
time. `usage-thread.ts` is main's side: it starts the thread, sends each
sweep's open projects and panes, and rejects a sweep whose thread died, so the
next sweep starts a new one. The thread saves each log's counts to
`usage-counts.json` in userData (`usage-counts.ts`) after a launch's first sweep
and every ten minutes after it, when the bytes differ. A launch starts from
them and reads only the logs whose mtime has moved, each one whole: 0.3 s for
6.3 GB of logs where reading every one took 36 s. A log shorter than what was
counted forgets its count and is read again from the start. A missing, damaged
or older file means every log is read, as on a first launch.

## Scenarios

- Given Claude Code has written session logs for a project, when the sweep runs, then the manager's
  row shows its five-hour, week and all-time totals.
- Given a pane runs Claude Code, when its replies cost tokens, then the pane's own figure moves.
- Given a pane's session wrote or read the prompt cache, when the sweep runs, then the snapshot
  carries that pane's last use of it and the tier it last wrote, for the workers popup; a subagent's
  replies are left out.
- Given the logs are read, when the sweep runs, then nothing in them is written to.
- Given years of logs, when the app launches, then typing and pane output do not stall while the
  first sweep reads them.
- Given the app ran before, when it launches, then only the logs written since are read, and the
  totals are the ones reading every log gives.
