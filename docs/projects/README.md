# Projects

`~/.dashboard/projects.yaml`: every project the manager can be asked about, by
name or by another name, written by hand. `dashboard project` reads it.

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

`init` reads the app's own `session.json` (the projects open at its last save)
and `recents.json` from the folder pane shells carry as `DASHBOARD_USER_DATA`,
keeps the folders still there, writes a path under home from `~`, and names a
second folder with the same name `-2`. Run outside a pane, where there is no
`DASHBOARD_USER_DATA`, it refuses and writes nothing, so a later run from a pane
is not blocked by an empty file.

## Files

Folders: `src/main/projects/`.

- The file: `projects-file.ts`, `projects-file.test.ts`
- The first file `init` writes: `projects-first.ts`, `projects-first.test.ts`
- The `project` command: `project-cli.ts`, `project-cli.test.ts`, `project-program.ts`
  (run as `dashboard project`, see [command](../command/README.md))

## Scenarios

- Given a project with `aka: [mandala]`, when `dashboard project find Mandala` runs, then that project is printed.
- Given a file with a misspelt key on line 3 and a project with no name on line 4, when any verb runs, then both problems are printed, `projects.yaml:3:` and `projects.yaml:4:`, and it exits 1.
- Given two projects that share a name or aka, when any verb runs, then the second one's line is named as the problem.
- Given no `~/.dashboard/projects.yaml`, when `list` or `find` runs, then it says the file does not exist yet, names `dashboard project init`, and exits 1.
- Given no `~/.dashboard/projects.yaml` and two projects open, when `dashboard project init` runs in a pane, then the file lists those two and every recent project still on disk, and `project list` reads it.
- Given a `~/.dashboard/projects.yaml`, when `dashboard project init` runs, then the file is left as it was, and it says so and exits 1.

## Open questions

- `path` is printed as written; `~` is expanded only once something opens a project from it.
