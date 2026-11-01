# Workers

A project's main session dispatches work into worker panes and the `session`
command lets an agent in a pane talk to the running app: start a worker, say
it is done, list what runs where. Each pane's Claude conversation is resumed
after a restart.

## Files

Folders: `src/main/workers/`.

- Dispatch: `dispatch.ts`, `../projects/project-named.ts` (the project `--project` names), `worker-channels.ts`, `finished-work.ts`
- The `session` command: `session-cli.ts`, `session-cli-entry.ts`,
  `session-program.ts`, `session-socket.ts`, `session-requests.ts` (also
  `dashboard pane`, see [command](../command/README.md))
- Resume: `pane-sessions.ts`, `claude-resume.ts`, `resume-ledger.ts`

## Scenarios

- Given a project is open, when main dispatches a task, then a worker pane opens in the list on the right and runs it.
- Given a worker's agent stops, when its Stop hook runs `session notify <id> done`, then the pane gets a green edge and `session list` says `done`.
- Given a worker ran Claude Code, when the app restarts, then the pane comes back resumed as main's worker with the worker's flags.
- Given a project folder called `My API`, when its sessions start, then main is `main-my-api` and its workers `my-api-terminal-<n>` (lower-case, every other run one hyphen, none at either end, never cut short); a folder name with no Latin letters gives `main-project`, and the manager's folder `~/.dashboard` gives `main-manager` (manager-decision-2).
- Given the manager's main, when it runs `pane claim --project crm` and `crm` is an exact name or aka in `~/.dashboard/projects.yaml`, then a worker opens on that project's page (the project opened first if it was closed, its `~` expanded) and its id is printed; a word that is not an exact name or aka is refused with the projects it could be (workers-decision-2).
- Given a pane claimed with `--project`, when the asker runs it, then it works in that project as `<project>-terminal-<n>` and reports to the asker's main; any other project but the pane's own is refused it.
- Given several open projects, when `pane list --all` runs, then every open page's panes are listed, the manager's first, each line led by its project's name.
- Given a throwaway worktree with uncommitted work, when the worker is released, then the worktree is kept and the reply says why.

## Open questions

- Worker numbers stay put while others close and a new one takes the lowest
  number free, so it can appear mid-list (workers-decision-1).
- A plain shell worker does not come back after a restart.
