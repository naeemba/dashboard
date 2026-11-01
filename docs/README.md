# Docs

One folder per feature. Each feature's `README.md` lists the files it owns,
what it does, its acceptance scenarios and open questions; `hard-rules.md`,
`decisions.md` and `history.md` appear with their first entry. A file is
claimed by one feature only, in that feature's README.

Every rule and decision has a stable id, `<feature>-rule-N` and
`<feature>-decision-N`, never renumbered. History lines, pull requests and
commits cite the id.

## Features

| Feature | What it is |
|---|---|
| [app](app/README.md) | The window, its pages, restore, the log and shared helpers |
| [panes](panes/README.md) | A project's terminals: main on the left, workers on the right |
| [workers](workers/README.md) | Main dispatching into worker panes, the `session` command, resume |
| [chat](chat/README.md) | The Claude screen: the project's main session as an Agent SDK chat |
| [nvim](nvim/README.md) | The editor view, scrollback and file paths opened in it |
| [board](board/README.md) | The kanban board and the `board` command |
| [command](command/README.md) | The `dashboard` command: `board`, `pane` and `project` behind one entry |
| [projects](projects/README.md) | `~/.dashboard/projects.yaml` and `dashboard project find`, `list`, `init`, `open` and `close` |
| [ship](ship/README.md) | A card into a worktree with an agent, the review, the worktree list |
| [notes](notes/README.md) | One page of notes per project and one for the manager |
| [drawer](drawer/README.md) | The drawer of a page's docs and the Claude sessions the app started |
| [manager](manager/README.md) | The first tab: what wants you, every board, the command runner |
| [usage](usage/README.md) | Token usage per project and per pane |
| [markets](markets/README.md) | The four cards across the top of the manager page |
| [remote-host](remote-host/README.md) | A second screen connected to another Dashboard's session |
| [settings](settings/README.md) | The settings file and screen |
| [keys](keys/README.md) | The shortcut table, modes, help dialog and which-key strip |
| [errors](errors/README.md) | Refusals, failures nothing caught, failures at launch |

## Cross-cutting

Rules that hold for every feature. `CLAUDE.md` states each in one line.

| Folder | What it is |
|---|---|
| [conventions](conventions/README.md) | Keyboard first, `dir="auto"`, `hidden` against the stylesheet |
| [workflow](workflow/README.md) | Never restart the app, a decision gets a test, bump the version |
| [performance](performance/README.md) | How to profile a demo instance, and what each profiling run found |

Reviews of the whole app are in `review/`, one file per date. They argue
with the decisions above and are inputs, not the record: a verdict changes
nothing until a card acts on it.

Older design specs and plans are in `superpowers/`; they are inputs, not the
record.
