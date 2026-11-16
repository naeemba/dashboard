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
| `pane` | the `session` command ([workers](../workers/README.md)) | claim [--project], run, list [--all], send, release, finish, report, notify |
| `project` | the `project` program ([projects](../projects/README.md)) | list, find, init, add, set, remove, open, close, focus |
| `pr` | the `pr` program, here | land [--project] |
| `budget` | the `budget` program, here | none, or --cap |

`pr land <number|url|branch>` lands a pull request as a review worker with
merging on does: it notes the head commit, waits on `gh pr checks --watch`,
then runs `gh pr merge --merge --match-head-commit <sha>`. No checks reported is
asked once more a minute later, and a repository that still has none is merged.
A merge call that fails is read back from the pull request: merged at the
noted commit is reported merged (the merge went through and only gh's answer
was lost), and a network error is tried once more five seconds on. A network
error on the wait is watched once more five seconds on, not read as a failed
check. A second network error says gh's answer was lost, never that a check
failed or the merge was refused. A failed check or a refused
merge exits 1 and merges nothing. The wait is as long as CI takes: main runs it in the background at the longest
timeout, and runs it again if that limit stops it. A flag where the pull request
goes (`pr land --help`) never reaches gh as the pull request. It is a merge by
whoever runs it, so `review.autoMerge` does not gate it, and it is not in the
rules the app allows every session (command-decision-5). It needs gh, never the
app.

`budget` reads the 7-day usage of the Claude account from
`~/.claude/usage-7d.json`, which the user's statusline writes each time it draws
and the app at most once a minute when a Claude screen is measured (`{"usedPercentage": <number>, "at": "<ISO time>"}`), against `budget.weeklyCap`
in settings.json. It prints the share used, the cap and how old the reading is,
and exits 0 under the cap, 1 at or over it, and 2 when it cannot say: no cap
set, no file, a file that does not read, a reading older than 30 minutes, or
one dated more than 5 minutes ahead (a clock that was wrong when it wrote). The
file is written only while some session is on screen, so a loop left
overnight reads a stale figure, and stale is never under. `budget --cap <n>`
sets the cap (above 0, at most 100), the settings screen's Budget row too; a
running app takes the change at once. Main's prompt tells it to run `budget`
before each round of a long loop and stop on anything but 0, and reading it is
allowed in every session the app starts; `--cap` is asked (command-decision-6).
It needs no app and no gh.

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
files and never start it, `pr` needs only gh and `budget` nothing:
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
- Ending quietly when the reader of the output goes away (`| head`): `closed-output.ts`, `closed-output.test.ts`, installed by every `*-cli-entry.ts`
- The `pr` noun: `pull-request-cli.ts`, `pull-request-cli.test.ts`, `pull-request-program.ts`
- The `budget` noun: `budget-cli.ts`, `budget-cli.test.ts`, `budget-program.ts`; the cap is written through settings.cap (`src/main/actions/settings/cap.ts`), its port `writeWeeklyCap` in `src/main/settings/settings-store.ts`

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
- Given a board of forty cards, when `node "$DASHBOARD_BOARD" list | head` runs, then ten lines print and it exits 0, with no `write EPIPE` stack; the same for `$DASHBOARD_SESSION`, `$DASHBOARD_COMMAND` and create-task.
- Given an open pull request whose checks pass, when `dashboard pr land 12` runs, then it merges the head commit it noted before the wait and prints `merged 12 at <sha>`; a push during the wait makes gh refuse the merge, and it says so and exits 1.
- Given `gh pr merge` fails with `Post https://api.github.com/graphql: unexpected EOF` and the pull request is merged at the noted commit, when `pr land` reads it back, then it prints `merged 12 at <sha>`; still open, it tries the merge once more.
- Given a check fails, when `pr land` waits on it, then nothing is merged and the checks print.
- Given the manager's main in `~/.dashboard`, when it runs `pr land 12 --project crm`, then gh runs in crm's folder.
- Given a cap of 74 and a reading of 64% from three minutes ago, when `dashboard budget` runs, then it prints both and the age and exits 0; at 74% it exits 1.
- Given no statusline drawn and no Claude screen measured for an hour, when `dashboard budget` runs, then it says the reading is too old and exits 2.
- Given a turn ends on a Claude screen in the app, when `dashboard budget` runs, then it reads that screen's 7-day figure from under a minute ago.
- Given the app running, when `dashboard budget --cap 60` runs, then the settings screen shows 60 and the next save there keeps it.

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
