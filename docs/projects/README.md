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
| `project open <name>` | `opened <name>`: the app opens its folder the way the project picker does |
| `project close <name>` | `closed <name>`, or the close key's own refusal naming the panes still running something |

`open` and `close` take a name or an aka exactly, in any case; a word that
only comes close is refused with what it came close to. The path's leading `~`
is the home folder. Close asks no question: the command has nobody at the
keyboard to answer one, so an unsaved buffer in the project's editor, which
the refusal never reads, goes with the rest. Both reach the app over the
`pane` noun's socket, so they work only from a pane the app opened.

## Files

Folders: `src/main/projects/`.

- The file: `projects-file.ts`, `projects-file.test.ts`
- The `project` command: `project-cli.ts`, `project-cli.test.ts`, `project-program.ts`
  (run as `dashboard project`, see [command](../command/README.md))
- Open and close in main: `project-requests.ts`, `project-requests.test.ts`

## Scenarios

- Given a project with `aka: [mandala]`, when `dashboard project find Mandala` runs, then that project is printed.
- Given a file with a misspelt key on line 3 and a project with no name on line 4, when any verb runs, then both problems are printed, `projects.yaml:3:` and `projects.yaml:4:`, and it exits 1.
- Given two projects that share a name or aka, when any verb runs, then the second one's line is named as the problem.
- Given no `~/.dashboard/projects.yaml`, when any verb runs, then it says the file does not exist yet and exits 1.
- Given `path: ~/Workspace/new-crm` and the project not open, when `dashboard project open crm` runs in a pane, then a new-crm page appears and it prints `opened new-crm`.
- Given new-crm open with `npm run dev` in terminal 2, when `dashboard project close new-crm` runs, then it prints `new-crm is still running in terminal 2 npm — stop it and close again`, exits 1 and the page stays.
- Given new-crm open with every pane at a prompt, when `dashboard project close new-crm` runs, then the page goes with no dialog.
- Given `dashboard project close cr`, when no project is named or aka'd `cr`, then it is refused naming the near matches and nothing closes.

## Open questions

- `path` is printed as written by `list` and `find`; `~` is expanded by `open` and `close`.
- A pane's own name, given on the screen, is not in the command's refusal: main never sees it, so the pane is named `terminal 2`.
