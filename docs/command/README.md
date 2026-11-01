# Command

The `dashboard` command: one entry, `node "$DASHBOARD_COMMAND" <noun> <verb> ...`,
that an agent in any pane runs to reach the app. Each noun is a program of its
own and parses its own verbs; this feature only picks the program.

| Noun | Program | Verbs |
|---|---|---|
| `board` | the `board` command ([board](../board/README.md)) | list, show, add, move, set, comment |
| `pane` | the `session` command ([workers](../workers/README.md)) | claim [--project], run, list [--all], release, notify |
| `project` | the `project` program ([projects](../projects/README.md)) | list, find, init, open, close |

`session` is another name for `pane`.

## Files

Folders: `src/main/command/`.

- Which noun: `dashboard-cli.ts`, `dashboard-cli.test.ts`
- The program: `dashboard-cli-entry.ts`, built by `vite.dashboard-cli.config.ts`
- What a program prints when it throws: `failure-line.ts`, `failure-line.test.ts`

## Scenarios

- Given a pane, when `node "$DASHBOARD_COMMAND" board move <id> Done` runs, then the card moves exactly as `node "$DASHBOARD_BOARD" move <id> Done` moves it.
- Given a pane, when `node "$DASHBOARD_COMMAND" pane claim` or `session claim` runs, then a worker pane opens and its id is printed, as `node "$DASHBOARD_SESSION" claim` does.
- Given a skill or a worker hook calling `node "$DASHBOARD_BOARD"` or `node "$DASHBOARD_SESSION"` with the old words, when it runs, then it works unchanged.
- Given no noun or one it does not know, when the command runs, then it prints the nouns it takes and exits 1.

## Adding to it

- A new verb belongs to its noun's parser (`board-cli.ts`, `session-cli.ts`, `project-cli.ts`), never to `dashboard-cli.ts`.
- A new noun is a row in `NOUNS` and a line in `DASHBOARD_USAGE` in `dashboard-cli.ts`, a branch in
  `dashboard-cli-entry.ts`, and a program module beside its feature, like `board-program.ts`. The
  built file needs no packaging change: every `*-cli-entry.js` is unpacked.

## Open questions

- The `board` and `session` usage text still names its own command (`board list`, `session claim`);
  under `dashboard` the words after the noun are the same.
