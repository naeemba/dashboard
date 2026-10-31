# Usage

Token usage per project and per pane, read from Claude Code's own session
logs: this five-hour window, this week and all time, with a trend.

## Files

- `usage.ts`, `usage-store.ts`, `usage-sweep.ts`, `usage.css`

## Scenarios

- Given Claude Code has written session logs for a project, when the sweep runs, then the manager's row shows its five-hour, week and all-time totals.
- Given a pane runs Claude Code, when its replies cost tokens, then the pane's own figure moves.
- Given the logs are read, when the sweep runs, then nothing in them is written to.
