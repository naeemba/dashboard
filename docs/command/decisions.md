# Command: decisions

Settled questions. Read the entry before re-litigating it.

## command-decision-1: Three built files, not one

`board-cli-entry.js` and `session-cli-entry.js` keep being built beside `dashboard-cli-entry.js`.
Every running shell holds `DASHBOARD_BOARD` and `DASHBOARD_SESSION` as paths to those two files, and
skills and worker hooks call them with no noun in front. Pointing either variable at the new entry
would turn `node "$DASHBOARD_BOARD" list` into "no such noun: list". The three entries share one
program per noun (`board-program.ts`, `session-program.ts`), so they cannot disagree.
