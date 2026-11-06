# Projects

`~/.dashboard/projects.yaml`: every project the manager can be asked about, by
name or by another name. `dashboard project` reads it, changes it, and opens and
closes the projects it names; you can also edit it by hand.

    - name: new-crm
      aka: [crm]
      path: ~/Workspace/new-crm
      site: https://crm.example.com
      about: The sales team's CRM
      deploy:
        - name: new-raxel
          role: test
          address: https://test.example.com

`name` and `path` are required; `aka`, `site`, `about` and `deploy` are not. A
deploy needs all of `name`, `role` and `address`.

| Verb | What it prints |
|---|---|
| `project list` | every project, `open` under each the app had open at its last save, then open projects the file does not list |
| `project find <word>` | the projects whose name or aka match the word, best first, then those whose about contains it |
| `project init` | writes a first `projects.yaml` from the open and recent projects, name and path each; never over a file that is there |
| `project add <path> [--name <n>] [--aka a,b] [--site <url>] [--about "<line>"]` | `added <name> in <file>`: a new entry at the end, the name from the folder unless given |
| `project set <name> [--aka a,b] [--site <url>] [--about "<line>"] [--deploy name=<n>,role=<r>,address=<a>]... [--clear <field>]...` | `changed <name> in <file>` |
| `project remove <name>` | `removed <name> in <file>` |
| `project open <name>` | `opened <name>`: the app opens its folder the way the project picker does |
| `project close <name>` | `closed <name>`, or the close key's own refusal naming the panes still running something |
| `project focus <name>` | `switched to <name>`: the window comes to the front on that project's page, at its main pane |

`open`, `close` and `focus` take a name or an aka exactly, in any case; a word that
only comes close is refused with what it came close to. The path's leading `~`
is the home folder, and a path neither absolute nor under `~` is refused, here and
for `pane claim --project`. Close asks no question: the command has nobody at the
keyboard to answer one, so an unsaved buffer in the project's editor, which
the refusal never reads, goes with the rest. All three reach the app over the
`pane` noun's socket, from a pane or any terminal, and start the app when none
answers ([command](../command/README.md)). A page
restored while its folder was gone is not open: `open` revives it once the
folder is back, as the picker does. A project is found by its real path, so a
folder opened through a symlink is the same project as its projects.yaml entry.

`init` reads the app's own `session.json` (the projects open at its last save)
and `recents.json` from its userData folder (the one pane shells carry as
`DASHBOARD_USER_DATA`, else Electron's default for Dashboard), keeps the folders
still there, writes a path under home from `~`, and names a second folder with
the same name `-2`. Before the app has ever run there is no such folder, and it
refuses and writes nothing, so a later run is not blocked by an empty file.
`list` reads the same `session.json` for what is open and never starts the app.

`add`, `set` and `remove` edit the file in place: comments, blank lines and the
order of the entries stay as they were, and the new text is read back by the
same reader as every other verb before it replaces the file, atomically. A
change that reader would refuse — a name or aka another project has, a deploy
with no address, a line break in an about — is refused with its message and
nothing is written, and a file that does not read is never edited. `add`
refuses a folder the file lists already, compared by real path, so a folder
reached through a symlink is the same one; a relative path is read from the
folder the command runs in, and a path under home is written from `~`. With no
file, `add` writes the first one.

On `set`, `--aka` adds names beside the ones there, `--deploy` adds a deploy or
changes the one with that name (only the fields given; the other deploys stay),
and `--site` and `--about` replace. `--clear` takes `aka`, `site`, `about` or
`deploy` away, and runs first, so `--clear deploy --deploy name=...` replaces
the list. `--deploy` and `--clear` can be given more than once.

The app adds a project to the file whenever it opens one the file does not list
— from the picker, `project open`, `pane claim --project` or a restored page —
name and path only, the name made unique with `-2`, `-3`. It never rewrites,
reorders or removes an entry, writes nothing while there is no file (that is
`init`'s) or while the file does not read, and a failed write never fails the
open.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

The first tab along the top is the manager; every tab after it is one project,
in the order you put them in. A click on a tab goes to it, the same as its jump
key. A project cannot be moved in front of the manager, so the first two move
keys both land it in tab 2. The next and previous keys walk the whole strip, so
they pass through the manager on the way round. The window opens on the projects
the last run was left on. Every worker pane's shell runs in a pane host outside
the app, so a quit, a crash or an update leaves it running, and the next launch
puts it back in its pane mid-job, screen and all. A pane whose shell did not
survive (the machine restarted) and was running Claude Code comes back in that
conversation, resumed in the folder it ran in. Closing the window asks first,
because it stops every Claude screen; the worker shells are left running, unless
they run in the app this time (no pane host, another Dashboard holds it, or it
died), and then it says they are killed. The editor always stops, and starts
fresh.

The close key takes one project away instead, the one whose page you are on: its
page, its shells and its editor go, whatever was in them, its tab goes with it
and the next tab along takes its place, and the next launch opens without it. It
refuses while one of that project's workers has anything running in it — an
agent, a dev server, a tail, vim — and names each pane in the way with what was
found running in it, the way a refused ship does. That is the same reading the
command screen picks a free pane by, so a pane it would not type into is a pane
this will not kill without asking. Main and the editor are not counted: each
runs for as long as the project is open, and a close that counted them could
never happen. Main's conversation comes back when the project is opened again.
Nor is a job you put in the background, which leaves the shell at its prompt. So
a close it allows is still not a promise that nothing was running — which is why
it asks first, and Enter is what takes the project away.

The drawer, the button at the left of the tabs or its key, opens on the left of
a project's page and pushes the panes aside. It lists two things: the markdown
under the project's docs/ folder as a tree, and the Claude conversations the app
started for it — main, every worker, every card's agent — newest first, fifty at
a time with a Load more row at the bottom. Type to filter both, which finds a
doc inside a closed folder too; the arrows walk the rows, Right opens a folder
and Left closes it, and Enter on a folder does either. Enter on a doc shows it
rendered, full screen: the arrows scroll it, Enter on its Edit row opens it in
the project's nvim, Escape goes back to the drawer. Enter on a session resumes
it in a new worker pane, in the folder it ran in, and is refused while it still
runs somewhere. F2 renames a session. Escape or the key again closes the drawer,
and closed it takes no room at all; open, it stays open on every tab and lists
the page in front. On the manager's page the button is there too and the drawer
lists the markdown under ~/.dashboard and ~/.claude, a folder read when you open
it, so the filter finds only what is in the folders opened; a doc there has no
Edit row, since the manager has no nvim. The sessions are the manager's own.

The project list has one more row at the bottom, Connect to a host: another
Dashboard, on another machine, that has a port and a token in its settings.
Connected, this window is a second screen of that session — its projects, its
shells, its boards — and the row becomes Disconnect. Until you search, the host
you last connected to leads the list as Reconnect, so the list and Enter take
you back to it. Opening a new project while connected asks for a folder path on
the host, since a folder dialog here would show this machine's disk. Type a path
that starts with /, \, ~ or a drive letter and a row opens that folder, here or
on the host, without the folder dialog; it follows a recent whose path contains
it, and leads otherwise. One that is not a folder is refused.

## Files

Folders: `src/main/projects/`.

- The file: `projects-file.ts` (also reads it from disk), `projects-file.test.ts`
- The project a word names: `project-named.ts`, `project-named.test.ts`
- The first file `init` writes: `projects-first.ts`, `projects-first.test.ts`
- Every later write — add, set, remove and the app's append: `projects-write.ts`, `projects-write.test.ts`
- The `project` command: `project-cli.ts`, `project-cli.test.ts`, `project-program.ts`
  (run as `dashboard project`, see [command](../command/README.md))
- Open and close in main: `project-requests.ts`, `project-requests.test.ts`

## Scenarios

- Given a project with `aka: [mandala]`, when `dashboard project find Mandala` runs, then that project is printed.
- Given a file with a misspelt key on line 3 and a project with no name on line 4, when any verb runs, then both problems are printed, `projects.yaml:3:` and `projects.yaml:4:`, and it exits 1.
- Given two projects that share a name or aka, when any verb runs, then the second one's line is named as the problem.
- Given no `~/.dashboard/projects.yaml`, when `list` or `find` runs, then it says the file does not exist yet, names `dashboard project init`, and exits 1.
- Given no `~/.dashboard/projects.yaml` and two projects open, when `dashboard project init` runs, then the file lists those two and every recent project still on disk, and `project list` reads it.
- Given a `~/.dashboard/projects.yaml`, when `dashboard project init` runs, then the file is left as it was, and it says so and exits 1.
- Given `path: ~/Workspace/new-crm` and the project not open, when `dashboard project open crm` runs in a pane, then a new-crm page appears and it prints `opened new-crm`.
- Given api restored reading `Directory not found` and its drive mounted since, when `dashboard project open api` runs, then the page comes back with its shells and it prints `opened api`.
- Given new-crm opened from the picker as `~/ws/new-crm`, `ws` a symlink to `Workspace`, when `dashboard project close new-crm` runs, then that page closes.
- Given new-crm open with `npm run dev` in terminal 2, when `dashboard project close new-crm` runs, then it prints `new-crm is still running in terminal 2 npm — stop it and close again`, exits 1 and the page stays.
- Given new-crm open with every pane at a prompt, when `dashboard project close new-crm` runs, then the page goes with no dialog.
- Given new-crm open on another tab, when `dashboard project focus crm` runs, then the window comes forward on new-crm's page and it prints `switched to new-crm`; a project not open is refused.
- Given new-crm open and listed, and notes open but not listed, when `dashboard project list` runs, then new-crm reads `open` and notes is listed after the file's projects as `open, not in` the file.
- Given `dashboard project close cr`, when no project is named or aka'd `cr`, then it is refused naming the near matches and nothing closes.
- Given a commented projects.yaml, when `dashboard project add ~/api --aka backend` runs, then `- name: api` with `aka: [backend]` and `path: ~/api` is the last entry and every comment is still there.
- Given new-crm listed, when `dashboard project add ~/ws/new-crm` runs and `ws` links to `Workspace`, then it is refused as already listed, as new-crm.
- Given new-crm with a `new-raxel` test deploy, when `dashboard project set crm --deploy name=new-raxel,address=https://staging.example.com` runs, then new-raxel's address changes, its role stays test, and every other deploy stays.
- Given `dashboard project set crm --aka screensaver`, when screensaver is another project, then it is refused naming that project and the file is left as it was.
- Given a projects.yaml that does not list ~/forks/crm, when the app opens that folder, then the file ends with `- name: crm-2` and `path: ~/forks/crm` (crm being taken).
- Given no projects.yaml, when the app opens a project, then no file is written.

## Open questions

- `path` is printed as written by `list` and `find`; `~` is expanded only once something opens a
  project from it (`project-named.ts`, used by `project open`, `close`, `focus`, `board --project` and `pane claim --project`).
- A pane's own name, given on the screen, is not in the command's refusal: main never sees it, so the pane is named `terminal 2`.
