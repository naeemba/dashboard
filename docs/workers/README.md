# Workers

A project's main session dispatches work into worker panes and the `session`
command lets an agent in a pane talk to the running app: start a worker, say
it is done, list what runs where. Each pane's Claude conversation is resumed
after a restart.

## Files

Folders: `src/main/workers/`, `src/shared/workers/`.

- Dispatch: `dispatch.ts`, `../projects/project-named.ts` (the project `--project` names), `worker-channels.ts`, `finished-work.ts`
- The `session` command: `session-cli.ts`, `session-cli-entry.ts`,
  `session-program.ts`, `session-socket.ts`, `session-requests.ts` (also
  `dashboard pane`, see [command](../command/README.md))
- What the command and the app agree on before an answer, the build stamp and the acceptance timeout: `app-handshake.ts`
- When main hears a worker stopped: `stop-notices.ts`, `done-report.ts`
- Resume: `pane-sessions.ts`, `claude-resume.ts`, `resume-ledger.ts`
- What each main dispatched, as its status line and workers popup read it: `worker-roster.ts`, `pane-link.ts`
- The app's index of every Claude it started: `session-index.ts`, `session-index-store.ts` (listed by the [drawer](../drawer/README.md))
- A worker run as a Claude screen (`pane run --screen`): `screen-workers.ts`, `../../shared/workers/screen-key.ts`; the session is the [chat](../chat/README.md)'s `chat-sessions.ts`, the pane `src/renderer/app/page.ts` (workers-decision-5)

## Scenarios

- Given a project is open, when main dispatches a task, then a worker pane opens in the list on the right and runs it.
- Given Dashboard on Windows, when a pane runs `node "$DASHBOARD_COMMAND" pane list`, then the app's answer comes back over the named pipe rather than an empty reply.
- Given a rebuild swapped the command under an app still running the old build, when a pane runs `pane list`, `claim` or `run`, then within 5 seconds it prints that the running app is likely older than the command and needs a restart and may still act on the request, and exits 1, rather than hanging.
- Given the command and the running app are different builds that both carry the stamp, when the command asks anything, then the app refuses it naming both builds and saying to restart; a command older than the stamp, including one from before #196 that ends its request by closing its side, is refused the same way.
- Given the command and the running app are different builds, when a worker's hook runs `session notify <id> done`, then the app still takes it and the pane goes green (workers-decision-4).
- Given a request the app has taken, when its answer takes longer than 5 seconds (a `pane run --card` making its worktree), then the command keeps waiting and prints the answer.
- Given the pane shell is Windows PowerShell, when main dispatches a task whose prompt holds double quotes, then the worker starts with its --settings JSON and its prompt exactly as they were written.
- Given a worker's agent stops, when its Stop hook runs `session notify <id> done`, then the pane gets a green edge and `session list` says `done`.
- Given main dispatched a worker, when the worker's Stop hook runs `session notify <id> done --stop-input` with no background task in flight and no wakeup scheduled, and main has not read a report from it within 10 seconds, then the main that dispatched it (the claimer's main for a pane claimed with `--project`) gets one prompt naming the worker and its pane, queued behind its turn if it is busy, and the Claude screen draws it as a status line; a card's agent or a Claude opened by hand tells nobody (workers-decision-1).
- Given a worker waiting on its own background work, when its turn ends with a background task in flight or a wakeup scheduled, then main is told nothing, and `pane list` says `paused, waiting on 2 background tasks` and the workers popup `waiting on 2 background tasks`; its next stop decides again, and a pause that lasts 30 minutes is told to main once.
- Given a worker whose Claude Code's Stop hook input has no `background_tasks` or `session_crons`, when its turn ends, then main is told only once it has stayed out of `running` for three minutes, as before them (workers-decision-1).
- Given a worker that sent main a report, when its turn ends, then main is told nothing more.
- Given main is mid-turn when a worker reports and stops, when the notice was queued before main reads the report, then the notice is taken back out of main's queue.
- Given a worker ran Claude Code, when the app restarts, then the pane comes back resumed as main's worker with the worker's flags.
- Given a project folder called `My API`, when its sessions start, then main is `main-my-api` and its workers `my-api-terminal-<n>` (lower-case, every other run one hyphen, none at either end, never cut short); a folder name with no Latin letters gives `main-project`, and the manager's folder `~/.dashboard` gives `main-manager` (manager-decision-2).
- Given the manager's main, when it runs `pane claim --project crm` and `crm` is an exact name or aka in `~/.dashboard/projects.yaml`, then a worker opens on that project's page (the project opened first if it was closed, its `~` expanded) and its id is printed; a word that is not an exact name or aka is refused with the projects it could be (workers-decision-2).
- Given a pane claimed with `--project`, when the asker runs it, then it works in that project as `<project>-terminal-<n>` and reports to the asker's main; any other project but the pane's own is refused it.
- Given main runs a worker, when `pane run` answers, then the line ends with `dashboard://pane/<id>`, which the Claude screen draws as a link to the pane; `pane claim` still prints the bare id, since main passes it straight to `run`.
- Given a worker in pane 2:3, when `pane send 2:3 "run the tests"` runs, then the text is typed into the pane and Enter pressed a moment after, and it prints `typed into 2:3`; main's pane and a closed one are refused.
- Given a plain terminal outside every project, when `dashboard pane claim --project crm` runs, then a worker opens on crm's page and reports to crm's main; `pane run`, `send` and `release` there act on the project their pane id names.
- Given several open projects, when `pane list --all` runs, then every open page's panes are listed, the manager's first, each line led by its project's name.
- Given main dispatches a worker or a card is shipped, when its Claude starts, then it starts with `--session-id` the app chose and the app's session index has its row first (drawer-decision-1).
- Given a worker's session has used the prompt cache, when the workers popup (Alt+W) is drawn, then the worker's row says `warm 42m` or `cold` for its own session, from the usage sweep (chat-decision-12).
- Given a throwaway worktree with uncommitted work, when the worker is released, then the worktree is kept and the reply says why.
- Given main runs `pane run <id> --screen "<prompt>"` (with `--card` or `--worktree` or neither), when the worker starts, then the pane shows a Claude screen instead of its terminal, in the same folder, in auto mode, named and indexed as a terminal worker is, with the prompt as its first message; a plain `pane run` is unchanged (workers-decision-5).
- Given a worker on a Claude screen, when its turn ends, then its own Stop hook, called in the app rather than through `session notify`, reports done with what it still waits on, and main is told exactly as for a terminal worker; a question it asks marks the pane blocked until answered.
- Given a worker on a Claude screen, when `pane send` names its pane, then the text goes in as its next prompt rather than into the hidden shell; `pane release` closes the pane and ends the session.
- Given a worker on a Claude screen, when the app restarts, then its pane comes back as a Claude screen on the same conversation once its project opens, as main's worker; the conversation carries on from the next prompt.

## Open questions

- Worker numbers stay put while others close and a new one takes the lowest
  number free, so it can appear mid-list (workers-decision-1).
- A plain shell worker does not come back after a restart.
