# Command

The `dashboard` command: one entry that drives the app from any terminal, for
you and for Claude sessions outside the app's panes. In a pane it is
`node "$DASHBOARD_COMMAND" <noun> <verb> ...`; anywhere else it is
`dashboard <noun> <verb> ...`, the launcher `scripts/rebuild.sh` installs in
`~/.local/bin` on Linux and macOS. Each noun is a program of its own and parses
its own verbs; this feature only picks the program.

| Noun | Program | Verbs |
|---|---|---|
| `board` | the `board` command ([board](../board/README.md)) | list, show, add, move, set, comment; any of them with `--project <name>` |
| `pane` | the `session` command ([workers](../workers/README.md)) | claim [--project], run, list [--all], send, release, notify |
| `project` | the `project` program ([projects](../projects/README.md)) | list, find, init, add, set, remove, open, close, focus |

`session` is another name for `pane`. `dashboard` with no words opens the app,
or brings it to the front; a first word that is a flag (`--remote`) goes to the
app too. `dashboard --help` and `dashboard <noun> --help` print usage written
for someone who has never seen the app: that is how a Claude session learns it.

## When it starts the app

`pane ...`, `board ship` and `review`, a `board move` into Ship or Review, and
`project open`, `close` and `focus` need the running app. They
ask the app the pane belongs to (`DASHBOARD_SOCKET`), else the one whose socket
path is in `session-socket` in the app's userData folder. When neither answers
they start the app detached and wait up to 30 seconds for it to write that file
and answer, then ask; past that they say so and exit 1. `pane notify`, which a
worker's hook sends, never starts it (command-decision-2).

The app starts in the home folder, with the caller's environment minus its
Claude session (`CLAUDECODE`, `CLAUDE_PID`, every `CLAUDE_CODE_*`) and the pane
variables (`DASHBOARD_*`): every pane inherits the app's environment, and a
session started with another session's id is not saved. A pane that names a
userData folder (`DASHBOARD_USER_DATA`, set in a copy run with
`--user-data-dir`) starts the app with `--user-data-dir` on that folder, so it
writes `session-socket` where the command waits for it. Bare `dashboard` with a
`DASHBOARD_APP` that is gone says so and exits 1.

Every other `board` verb and move, `project list`, `find`, `init`, `add`, `set`
and `remove` work on
files and never start it:
the app already watches each project's `.dashboard` folder. Quitting,
restarting or replacing the app is never the command's.

## Outside a pane

A pane knows its project; a plain terminal does not, and the command never
guesses one. `board` uses the project of the folder you are in (the nearest
`.dashboard` or git repository above it), else `--project`, else refuses.
`pane claim` needs `--project`. `run`, `send` and `release` act on the project
the pane id names; `list` needs `--all` unless the folder is in an open project.

## Security

The socket lets anything that reaches it start Claude in any project with any
prompt. It lives in a fresh `mkdtemp` folder (0700) and is chmod 0600 once
listening; the pointer file holds only its path and is written 0600. No TCP
and no world-readable path. On Windows it is the named pipe, as before.

## Teaching Claude

The app does not edit your files. Copy this into your global `CLAUDE.md`:

    `dashboard --help` drives the Dashboard app from any terminal: open and
    switch projects, dispatch worker panes, move board cards. When you find
    something about a project that `dashboard project find <name>` does not
    show — a deployment and its address, the site, another name for it —
    record it: `dashboard project set <name> --deploy
    name=<n>,role=<r>,address=<a>`, `--site <url>`, `--aka <name>`.

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

- Which noun, and the usage: `dashboard-cli.ts`, `dashboard-cli.test.ts`
- The program: `dashboard-cli-entry.ts`, built by `vite.dashboard-cli.config.ts`
- Which socket, and starting the app when none answers: `reach-app.ts`, `reach-app.test.ts`, `start-app.ts`, `start-app.test.ts`
- Where the app says its socket is: `app-address.ts`, `app-address.test.ts`
- What every pane is handed to reach the app: `pane-environment.ts`, `pane-environment.test.ts`
- The launcher: `scripts/rebuild.sh`
- What a program prints when it throws: `failure-line.ts`, `failure-line.test.ts`

## Scenarios

- Given a pane, when `node "$DASHBOARD_COMMAND" board move <id> Done` runs, then the card moves exactly as `node "$DASHBOARD_BOARD" move <id> Done` moves it.
- Given a pane, when `node "$DASHBOARD_COMMAND" pane claim` or `session claim` runs, then a worker pane opens and its id is printed, as `node "$DASHBOARD_SESSION" claim` does.
- Given a skill or a worker hook calling `node "$DASHBOARD_BOARD"` or `node "$DASHBOARD_SESSION"` with the old words, when it runs, then it works unchanged.
- Given a noun it does not know, when the command runs, then it prints the nouns it takes and exits 1.
- Given a plain terminal and no app running, when `dashboard pane list --all` runs, then the app starts, and once it answers the panes are printed.
- Given a plain terminal and no app running, when `dashboard board list` runs in a project, then the cards print and no window appears.
- Given a plain terminal in `~/Downloads`, when `dashboard board list` runs, then it is refused naming `--project`, and `dashboard board list --project crm` prints crm's board.
- Given a plain terminal, when `dashboard pane claim` runs, then it is refused naming `--project`.
- Given a worker's hook whose app has quit, when it runs `pane notify <id> done`, then it says no Dashboard is running and nothing starts.
- Given a projects.yaml with a broken entry and a project open, when `dashboard project list` runs, then the file's error prints and it exits 1.
- Given a plain terminal, when `dashboard pane send 9:1 hi` runs and page 9 is not open, then it is refused naming `9:1`, not the folder.
- Given `dashboard --help` or `dashboard pane --help`, when it runs, then the usage prints and it exits 0.

## Adding to it

- A new verb belongs to its noun's parser (`board-cli.ts`, `session-cli.ts`, `project-cli.ts`), never to `dashboard-cli.ts`.
- A new noun is a row in `NOUNS` and a line in `DASHBOARD_USAGE` in `dashboard-cli.ts`, a branch in
  `dashboard-cli-entry.ts`, and a program module beside its feature, like `board-program.ts`. The
  built file needs no packaging change: every `*-cli-entry.js` is unpacked.

## Open questions

- The `board` and `session` usage text still names its own command (`board list`, `session claim`);
  `dashboard <noun> --help` says above it that the words after the noun are the same.
- The launcher needs `node` on PATH (command-decision-3). The card asked for Electron's own node;
  the fuse that allows it is off.
