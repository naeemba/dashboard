# Projects

`~/.dashboard/projects.yaml`: every project the manager can be asked about, by
name or by another name, written by hand. `dashboard project` reads it, and
opens and closes the projects it names.

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
| `project list` | every project |
| `project find <word>` | the projects whose name or aka match the word, best first, then those whose about contains it |
| `project init` | writes a first `projects.yaml` from the open and recent projects, name and path each; never over a file that is there |
| `project open <name>` | `opened <name>`: the app opens its folder the way the project picker does |
| `project close <name>` | `closed <name>`, or the close key's own refusal naming the panes still running something |

`open` and `close` take a name or an aka exactly, in any case; a word that
only comes close is refused with what it came close to. The path's leading `~`
is the home folder, and a path neither absolute nor under `~` is refused, here and
for `pane claim --project`. Close asks no question: the command has nobody at the
keyboard to answer one, so an unsaved buffer in the project's editor, which
the refusal never reads, goes with the rest. Both reach the app over the
`pane` noun's socket, so they work only from a pane the app opened. A page
restored while its folder was gone is not open: `open` revives it once the
folder is back, as the picker does. A project is found by its real path, so a
folder opened through a symlink is the same project as its projects.yaml entry.

`init` reads the app's own `session.json` (the projects open at its last save)
and `recents.json` from the folder pane shells carry as `DASHBOARD_USER_DATA`,
keeps the folders still there, writes a path under home from `~`, and names a
second folder with the same name `-2`. Run outside a pane, where there is no
`DASHBOARD_USER_DATA`, it refuses and writes nothing, so a later run from a pane
is not blocked by an empty file.

## Files

Folders: `src/main/projects/`.

- The file: `projects-file.ts` (also reads it from disk), `projects-file.test.ts`
- The project a word names: `project-named.ts`, `project-named.test.ts`
- The first file `init` writes: `projects-first.ts`, `projects-first.test.ts`
- The `project` command: `project-cli.ts`, `project-cli.test.ts`, `project-program.ts`
  (run as `dashboard project`, see [command](../command/README.md))
- Open and close in main: `project-requests.ts`, `project-requests.test.ts`

## Scenarios

- Given a project with `aka: [mandala]`, when `dashboard project find Mandala` runs, then that project is printed.
- Given a file with a misspelt key on line 3 and a project with no name on line 4, when any verb runs, then both problems are printed, `projects.yaml:3:` and `projects.yaml:4:`, and it exits 1.
- Given two projects that share a name or aka, when any verb runs, then the second one's line is named as the problem.
- Given no `~/.dashboard/projects.yaml`, when `list` or `find` runs, then it says the file does not exist yet, names `dashboard project init`, and exits 1.
- Given no `~/.dashboard/projects.yaml` and two projects open, when `dashboard project init` runs in a pane, then the file lists those two and every recent project still on disk, and `project list` reads it.
- Given a `~/.dashboard/projects.yaml`, when `dashboard project init` runs, then the file is left as it was, and it says so and exits 1.
- Given `path: ~/Workspace/new-crm` and the project not open, when `dashboard project open crm` runs in a pane, then a new-crm page appears and it prints `opened new-crm`.
- Given api restored reading `Directory not found` and its drive mounted since, when `dashboard project open api` runs, then the page comes back with its shells and it prints `opened api`.
- Given new-crm opened from the picker as `~/ws/new-crm`, `ws` a symlink to `Workspace`, when `dashboard project close new-crm` runs, then that page closes.
- Given new-crm open with `npm run dev` in terminal 2, when `dashboard project close new-crm` runs, then it prints `new-crm is still running in terminal 2 npm — stop it and close again`, exits 1 and the page stays.
- Given new-crm open with every pane at a prompt, when `dashboard project close new-crm` runs, then the page goes with no dialog.
- Given `dashboard project close cr`, when no project is named or aka'd `cr`, then it is refused naming the near matches and nothing closes.

## Open questions

- `path` is printed as written by `list` and `find`; `~` is expanded only once something opens a
  project from it (`project-named.ts`, used by `project open`, `project close` and `pane claim --project`).
- A pane's own name, given on the screen, is not in the command's refusal: main never sees it, so the pane is named `terminal 2`.
