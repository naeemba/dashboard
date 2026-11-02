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

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

One command, run in the projects you mark. Type it once — `npm audit`, `npm
outdated`, the test suite — and choose how it runs. Enter gives every marked
project a process of its own and puts the answers side by side: each row shows
how its project exited and the last line it printed, Enter on a finished row
shows the last few lines under it, and Escape stops the run. Nothing there
touches the shells, so whatever was in them is still there.

The other key types the command into a shell instead — one free pane in each
marked project, or a new worker where none is free, where it has history, prints
as it goes and can be taken over mid-run. A free pane is one that has not died
and has nothing running in it: it is the same question a ship asks before it
takes a pane, and gets the same answer, so a pane a ship would step around is
one this will not type into either. An agent, a dev server, a tail, psql, vim —
all of them hold a pane back. It picks in the ship's order too, which is the
lowest-numbered free pane, except that a pane still standing in a finished
card's worktree goes last — otherwise the line runs in that card's checkout
while an empty prompt of the project sits below it.

The one thing it cannot see is a job you put in the background: run npm run dev
& and the shell is at its prompt again, so that pane takes the line like any
other. That last part is unix only, the same way the ship's is: on Windows
nothing about a pane's foreground can be read, so only a pane a card's agent was
started in is held back, and a dev server there takes the line like anything
else.

A project a new worker cannot be opened in is named in the status bar rather
than quietly missed, and so is one whose folder has gone. Nothing comes back to
this screen from a run like that — the output is in the pane, on that project's
page.

The last line is a guess and this screen does not pretend otherwise: a command
whose final act is to redraw a progress bar shows that bar. Reading `npm audit`
properly — three high, none moderate — would need a parser per tool, and every
tool words it differently.

The command you typed lasts while the app is running and is gone on restart, and
so are the results: a run answers a question you are asking now, and is not a
record of anything.

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
