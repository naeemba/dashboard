# Workers

A project's main session dispatches work into worker panes and the `session`
command lets an agent in a pane talk to the running app: start a worker, say
it is done, list what runs where. Each pane's Claude conversation is resumed
after a restart, by pane.restore (docs/actions).

Main and every worker, in a terminal or on a Claude screen, are told about the
board in their system prompt (`BOARD_INSTRUCTIONS` in `dispatch.ts`) and run the
board guard hook beside their own, so none of them hand-edits a card or moves a
shipped one (board-decision-8).

## Files

Folders: `src/main/workers/`, `src/shared/workers/`.

- Dispatch: `dispatch.ts`, `../projects/project-named.ts` (the project
  `--project` names), `project-names.ts` (the name each project's sessions go
  by), `worker-channels.ts`, `finished-work.ts` (also whether a worktree's
  branch merged, for `pane finish`, tested in `session-finish.test.ts`, and the
  branch `pane landed` finds a worker by)
- The `session` command: `session-cli.ts`, `session-cli-entry.ts`,
  `session-program.ts`, `session-socket.ts`, `session-requests.ts` (also
  `dashboard pane`, see [command](../command/README.md)), and
  `session-request-ports.ts`, its ports built from what main holds
- The folder `pane run --in` may start a worker in: `run-folder.ts`
- Throwaway worktrees: `throwaway-marker.ts`, `finished-work.ts`, and
  `../actions/worktree/throwaway.ts` and `sweep.ts`
- What the command and the app agree on before an answer, the build stamp and
  the acceptance timeout: `app-handshake.ts`
- When main hears a worker stopped: `stop-notices.ts`, `done-report.ts`, and
  whose turn it was, `prompt-source.ts`, and the app's own question about a
  worker's tabs, whose turn counts as none of them, `app-question.ts`
- Work sent into a pane reported to the main that sent it:
  `../actions/pane/send.ts`, `../actions/pane/dispatch.ts` (workers-decision-1)
- Finished workers closed by main's own commands: `auto-release.ts`,
  `pane landed` in `session-requests.ts` (tested in `session-landed.test.ts`),
  asked by `pr land` (`../command/pull-request-cli.ts`) and a board move into
  Done or Cancelled (`../board/board-cli.ts`), the keyboard's pane from
  `../app/session-store.ts` (workers-decision-1)
- A conflicting pull request's `/pr-conflicts` sent to the agent on its branch:
  `pane conflicted` in `session-requests.ts` (tested in `session-landed.test.ts`),
  asked by `pr land`
- Resume: `pane-sessions.ts`, `claude-resume.ts`, `resume-ledger.ts`
- What each main dispatched, as its status line and workers popup read it:
  `worker-roster.ts`, `pane-link.ts`
- The app's index of every Claude it started: `session-index.ts`,
  `session-index-store.ts` (listed by the [drawer](../drawer/README.md))
- A worker's Claude screen, the `pane run` default off Windows:
  `session-cli.ts`; `screen-workers.ts`, `../../shared/workers/screen-key.ts`;
  the session is the [chat](../chat/README.md)'s `chat-sessions.ts`, the pane
  `src/renderer/app/page.ts` (workers-decision-5)
- A Claude screen opened by hand with New Claude, and which screen is whose:
  `screen-owner.ts`, `screen-workers.ts`, `worker-channels.ts`, the button
  `src/renderer/app/chrome-bars.ts` (workers-decision-7)
- Every agent a pane starts, screen or terminal, from every caller: the
  pane.dispatch action, `src/main/actions/pane/dispatch.ts` and
  `pane-actions.ts`, the default `pane-kind.ts`, the kind's type in
  `src/shared/panes/pane-kind.ts` (workers-decision-8,
  [actions](../actions/README.md))
- The pane pool, which holds main's workers to `workers.cap` (4) and queues a
  start past it: the decisions in `pane-pool.ts`, the queue's file
  `pane-queue-store.ts` (`pane-queue.json` in the app's user data), what main
  builds it on (settings, budget, boards) `pane-pool-ports.ts`, the
  pane.start, pane.queue and pane.unqueue actions and the drain in
  `../actions/pane/queue.ts`, built and drained by `session-requests.ts`
  (`pane start`, tested in `session-requests-pool.test.ts`); a ship and a review
  start through it from `../actions/card/card-actions.ts`
  (workers-decision-11)
- A worker gone silent, shown stalled and told to main once: `stall.ts`, its
  notice in `done-report.ts`, read by
  `session-requests.ts` (tested in `session-requests-stall.test.ts`), asked
  each minute by `../main.ts` (workers-decision-13)
- The screen host a worker screen's session runs in, so it outlives the app:
  `screen-host-server.ts`, `screen-host-entry.ts`, `screen-host-client.ts`,
  `screen-host-protocol.ts`, `dead-host.ts`, `../chat/input-queue.ts`
  (workers-decision-6)

## Scenarios

- Given a project is open, when main dispatches a task, then a worker pane opens
  in the list on the right and runs it.
- Given Dashboard on Windows, when a pane runs
  `node "$DASHBOARD_COMMAND" pane list`, then the app's answer comes back over the named pipe rather
  than an empty reply.
- Given a rebuild swapped the command under an app still running the old build,
  when a pane runs `pane list`, `claim` or `run`, then within 5 seconds it
  prints that the running app is likely older than the command and needs a
  restart and may still act on the request, and exits 1, rather than hanging.
- Given the command and the running app are different builds that both carry the
  stamp, when the command asks anything, then the app refuses it naming both
  builds and saying to restart; a command older than the stamp, including one
  from before #196 that ends its request by closing its side, is refused the
  same way.
- Given the command and the running app are different builds, when a worker's
  hook runs `session notify <id> done`, then the app still takes it and the pane
  goes green (workers-decision-4).
- Given a request the app has taken, when its answer takes longer than 5 seconds (a
  `pane run --card` making its worktree), then the command keeps waiting and prints the answer. A
  `pane run --worktree` answers only once the project's packages are installed in the new worktree
  (worktree.make, [ship](../ship/README.md)), minutes for a cold `npm ci`, so main's prompt and its
  usage tell main to give the call a ten-minute timeout (600000 ms) rather than Bash's two-minute
  default, which would report a failure for a worker that then starts anyway.
- Given 4 of main's workers running, blocked on a question or paused on their own
  background work, when main runs `pane start "<task>"` or `board ship <id>`, or
  the review sweep starts a review, then it answers `queued q7, 1st: 4 running,
  the cap is 4` at once, claims no pane and makes no worktree; when one of the 4
  is done, released or gone, q7 starts, its pane and worktree picked then, and
  the main that queued it is told `q7 started: …` (workers-decision-11).
- Given fewer than 4 running and nothing queued, when main runs `pane start`,
  then it claims a pane and answers as `pane run` does; `pane run <id>` at the
  cap is refused, saying `pane start` queues it.
- Given a queued ship whose card is moved into Done or Cancelled, deleted, or
  moved out of the Ship column its move queued it from, when the queue is next
  looked at, then the entry is dropped and its main told `q7 dropped: card … is
  Done` (`is not on the board`, `left Ship`). Given `board ship B --after A`,
  then B waits, letting later entries go ahead, until A is Done or Cancelled.
  Given a card file that does not parse (caught mid-write in a board sync),
  then the queued ship or review waits, `the board of api cannot be read`,
  never dropped; a withdrawal and the refusal of a start still read the board.
- Given the manager runs `board ship <id> --project crm` and the ship is queued,
  when it starts, then the manager is told `q7 started: …`, and the manager's
  `pane unqueue q7` withdraws it. Given api's main queued `pane start --project
  crm` and api is closed, then the entry waits until api is open again.
- Given `board review <id>` on a card still in Doing just after its pull request
  opened, with review.autoLoop on, then the review starts and answers so, rather
  than refusing itself as already queued.
- Given main ran `board move <id> Ship` from Todo and the ship is queued as q7, when main runs
  `pane unqueue q7`, then it answers `withdrew q7; card … back in Todo` and the card is in Todo.
- Given a card dragged on the board from Todo into Ship and the ship queued, when main withdraws
  it, then the card is back in Todo, the same as a move made with the command.
- Given a weekly cap set and the 7-day usage at or over it, when a slot frees,
  then nothing starts and `pane queue` says why; with no limit set, the budget
  never holds the queue.
- Given the app quits with 3 queued, when it starts again, then the 3 are still
  queued in order, and none starts until the panes the restart brings back are
  back and counted.
- Given the pane shell is Windows PowerShell, when main dispatches a task whose
  prompt holds double quotes, then the worker starts with its --settings JSON
  and its prompt exactly as they were written.
- Given a worker's agent stops, when its Stop hook runs
  `session notify <id> done`, then the pane gets a green edge and `session list` says `done`.
- Given main dispatched a worker, when the worker's Stop hook runs
  `session notify <id> done --stop-input` with no background task in flight and no wakeup scheduled,
  and main has not read a report from it within 10 seconds, then the main that dispatched it (the
  claimer's main for a pane claimed with `--project`) gets one prompt naming the worker and its
  pane, queued behind its turn if it is busy, and the Claude screen draws it as a status line; a
  card's agent tells its project's main the same way, and a Claude opened by hand tells nobody until
  a main sends it work (workers-decision-1).
- Given a worker waiting on its own background work, when its turn ends with a
  background task in flight or a wakeup scheduled, then main is told nothing,
  and `pane list` says `paused, waiting on 2 background tasks` and the workers
  popup `waiting on 2 background tasks`; its next stop decides again, and a
  pause that lasts 30 minutes is told to main once, unless main read a report
  from it since it last handed it work, or its work is in.
- Given main's worker at work, hung on a test that never ends, when no hook of
  its has run for `workers.stallMinutes` (20), then `pane list` and
  `pane status` say `stalled, silent 20 minutes` in place of `running`, and its
  main is told once, within a minute, naming it and its pane, which the Claude
  screen draws as a status line. It keeps its pane
  and its slot; the next prompt or tool it finishes makes it `running` again,
  and a later stall is told again. A turn you typed into it is not told
  (workers-decision-13).
- Given a worker whose Claude Code's Stop hook input has no `background_tasks`
  or `session_crons`, when its turn ends, then main is told only once it has
  stayed out of `running` for three minutes, as before them
  (workers-decision-1).
- Given a worker that sent main a report, when its turn ends, then main is told nothing more.
- Given a worker whose Stop hook input has `last_assistant_message`, when main
  is told it stopped, then the notice ends `Its last message: ` and the
  message's last 600 characters on one line, and `pane report <id>` prints the
  pane's line from `pane list` and the message's last 4000 characters, kept
  while the worker works again and dropped when the pane is run again or
  released (workers-decision-1).
- Given main's worker in a pane, when you type a prompt into it yourself and its
  turn ends, then main is told nothing of that stop, nor of the turns its own
  background work wakes it for after, until main sends it work with `pane send`
  and that prompt is submitted, however many of either are queued; the first
  prompt a worker was started or resumed on counts as main's
  (workers-decision-1).
- Given a rebuild swapped the command under an app still running the old build,
  when a worker's Stop hook sends its last message, then the old app's refusal
  is answered by sending the notify again without it, and the pane still goes
  green.
- Given main is mid-turn when a worker reports and stops, when the notice was
  queued before main reads the report, then the notice is taken back out of
  main's queue.
- Given main is mid-turn when a worker's notice comes due, when that turn read
  the worker's report, then main is told nothing, and when it did not, main is
  told once the turn ends, or, for a turn held open by main's background work,
  once the turn has run 30 minutes; a notice due after that is queued behind the
  turn.
- Given a worker reported and stopped, when main releases it in the turn that
  read the report and the notice was queued meanwhile, then the notice is taken
  back and main is told nothing of that worker afterwards, nor of a hook it
  fires late into a new worker at the same number.
- Given a worker ran Claude Code, when the app restarts, then the pane comes
  back resumed as main's worker with the worker's flags.
- Given a worker one page's main dispatched into another project's pane, when
  the app restarts and it is done, then the main that dispatched it is told and
  may report on or release it; the pane's own page's main is told only when that
  page is not open (workers-decision-3).
- Given a conversation that last ran on a Claude screen, when it is resumed from
  the drawer, then it opens on a Claude screen carrying that conversation on;
  one that last ran in a terminal opens as Claude Code in the terminal, and one
  the session index has no kind for opens as `pane run` would
  (workers-decision-8).
- Given a project folder called `My API`, when its sessions start, then main is
  `main-my-api` and its workers `my-api-terminal-<n>` (lower-case, every other
  run one hyphen, none at either end, never cut short); a folder name with no
  Latin letters gives `main-project`, and the manager's folder `~/.dashboard`
  gives `main-manager` (manager-decision-2).
- Given the manager's main, when it runs `pane claim --project crm` and `crm` is
  an exact name or aka in `~/.dashboard/projects.yaml`, then a worker opens on
  that project's page (the project opened first if it was closed, its `~`
  expanded) and its id is printed; a word that is not an exact name or aka is
  refused with the projects it could be (workers-decision-2).
- Given a pane claimed with `--project`, when the asker runs it, then it works
  in that project as `<project>-terminal-<n>` and reports to the asker's main;
  any other project but the pane's own is refused it.
- Given main has work in a repository that is not a project yet, when it
  dispatches it, then its prompt says to run `project add <path> --name <name>`
  and `pane start --project <name>`, never a pane on its own page in that
  repository.
- Given main runs a worker, when `pane run` answers, then the line ends with
  `dashboard://pane/<id>`, which the Claude screen draws as a link to the pane;
  `pane claim` still prints the bare id, since main passes it straight to `run`.
- Given a worker in pane 2:3, when `pane send 2:3 "run the tests"` runs, then
  the text is typed into the pane and Enter pressed a moment after, and it
  prints `typed into 2:3`; main's pane and a closed one are refused.
- Given an agent in a pane that no main dispatched (a Claude screen you opened,
  a card's agent), when a main runs `pane send` into it, then the text ends with
  the line telling it to SendMessage that main, the pane is that main's worker
  from then on (listed in its workers popup, its stop told to it, releasable by
  it), and text sent to a plain shell, or to Claude Code with no worker hooks
  (one resumed from the drawer), is typed as it is (workers-decision-1).
- Given a card is shipped or its review loop starts, when its agent starts, then
  it is told to SendMessage its project's main when done, and its stop is told
  to that main as a worker's is.
- Given merging is off for the project, when a review worker finishes, then its
  report to main names the loop's rounds, what each fixed, what is still open
  and the CI state, and whether any round changed what the card asked for or
  its design, and the merge is the user's (ship-decision-1).
- Given a worker's report says its review loop changed what the card asked
  for, or its design (the review prompt asks it to say so), when main is asked
  to land it, then main asks the user first instead of relaying the change.
- Given a worker main handed work in a worktree on branch `fix-it`, when
  main's `pr land 12` merges that branch, then the app releases the pane through
  pane.release, the status bar says `Closed pane 2:3: fix-it merged`, and a
  line before the verdict says `released 2:3`; with `--keep` nothing is asked.
- Given a worker in a card's worktree, when main moves the card into Done or
  Cancelled with the board command or its MCP tool, then the pane is released
  the same way, the status bar says `Closed pane 2:3: card finished`, and the
  move's output ends `released 2:3`.
- Given a review pane's own `pr land`, or a worker moving its own card into
  Done, when the app is asked `pane landed`, then the pane the command ran in
  (`--from`, its `DASHBOARD_PANE`) is never released: it is waiting on that
  answer, and main releases it with `pane finish` after its report.
- Given a worker main finished that way, when it has the keyboard, is blocked
  on a question, is mid-turn, you typed into it since main last sent it work,
  or no main ever handed it work, then it stays open and the line says why:
  `kept 2:3: it has the keyboard`. One only paused on its own background work
  is released: its work is in.
- Given a worker whose card is Done or Cancelled, or one `pane landed` kept,
  when its turn has ended, then `pane list` says
  `done, work in: pane finish 2:3` until main sends it work. Nothing closes a
  pane on a timer.
- Given a worker whose card is Done or Cancelled, or whose worktree's branch's
  pull request (the open one if any, else the newest, as the follow reads it)
  merged before the follow moved its card, when main runs `pane finish <id>`,
  then the pane is released as `pane release` would; otherwise it is refused
  saying the work is not in and the pane stays open. A worker in the project's
  own checkout is finished only by its card. A worktree already removed by the
  merge is released without asking git.
- Given main is asked to work a card, when it reads its prompt and
  `pane --help`, then both send it to `board ship <id>`, which makes the worktree, the pane and the
  agent; there is no pane verb for it.
- Given a plain terminal outside every project, when
  `dashboard pane claim --project crm` runs, then a worker opens on crm's page and reports to crm's
  main; `pane run`, `send` and `release` there act on the project their pane id names.
- Given several open projects, when `pane list --all` runs, then every open
  page's panes are listed, the manager's first, each line led by its project's
  name.
- Given three workers that ended turns, when `pane list --reports` runs, then
  each pane's line ends with a fifth column, the last 200 characters of its
  worker's last message on one line, empty for a pane that has said nothing;
  `pane report <id>` still prints the whole kept message.
- Given workers on cards and open pull requests, when `pane status` (the
  `pane_status` tool) runs, then each pane's line is `pane list --reports`'s
  with its card's id, column and title, its branch, and its open pull request
  with its CI state (`passed` when every check passed but the glyph has
  nothing to say: waiting on a review, or it cannot merge) before the
  report, then the open pull requests no pane holds follow, all from one
  `gh pr list` (or `glab mr list`); a forge that cannot answer leaves the
  panes printed, a card pane's pull request `pr unknown`, and says why. It is
  let through across builds of one major version, as list is
  (workers-decision-4).
- Given main dispatches a worker or a card is shipped, when its Claude starts,
  then it starts with `--session-id` the app chose and the app's session index
  has its row first (drawer-decision-1).
- Given a worker's session has used the prompt cache, when the workers popup
  (Alt+W) is drawn, then the worker's row says `warm 42m` or `cold` for its own
  session, from the usage sweep (chat-decision-12).
- Given a throwaway worktree with uncommitted work or commits no remote has,
  when the worker is released, then the worktree is kept and the reply says why;
  one with neither is removed, pull request or not, never pushed or not. A change or commit of
  `.dashboard/board/` alone is neither once origin's default branch holds it; one origin never
  held, or a fetch that fails, keeps it and the reply names the files (ship-decision-7,
  `finished-work.test.ts`).
- Given a throwaway worktree whose pull request squash-merged at its HEAD and whose remote branch
  is gone, when the worker is released, then the worktree is removed, not kept for commits on no
  remote (`finished-work.test.ts`).
- Given a throwaway worktree, when its pane is closed by hand or with its
  project instead of released, then it is let go of as release would, and the
  log says `pane 2:3 closed: removed <folder>` or why it was kept.
- Given throwaway worktrees left on disk at a restart, when the launch's panes
  are back, then each one a pane stands in is that pane's again, each other one
  with nothing to lose is removed, and one log line says what was removed and
  what was kept, and why. A pane counts as standing in one when its folder is
  inside it in real paths, so a project opened through a symlink still holds
  its throwaways.
- Given marking a new throwaway fails (a full disk), when `pane run --worktree`
  runs, then the worker starts anyway and the reply says a restart will not
  sweep that folder.
- Given fetching the base fails (an SSH key lost for a moment), when `pane run
  --worktree` runs, then it fetches once more a second later (not for a branch
  the remote does not have); if that fails too, the worktree
  is cut from the remote-tracking ref as the last fetch left it, and the reply
  and the log warn that it may be stale.
- Given a throwaway worktree a merge already removed
  (`gh pr merge --delete-branch` takes the branch's worktree with it), when the worker is released,
  then the pane closes and the reply says `released 2:3; <folder> was already removed`, not
  `session release failed: spawn git ENOENT`; a folder deleted by hand is pruned from git too, so
  its branch can be checked out again; a prune that fails (the project folder gone as well) is named
  in the reply, and the release still stands.
- Given main runs `pane run <id> "<prompt>"` (with `--card` or `--worktree` or
  neither), when the worker starts, then the pane shows a Claude screen instead
  of its terminal, in the same folder, in auto mode, named and indexed as a
  terminal worker is, with the prompt as its first message; `--screen` is still
  accepted and changes nothing (workers-decision-5).
- Given main keeps its own worktree of the project's repository on a branch, at
  `../api-mr174`, when it runs `pane run <id> --in ../api-mr174 "<prompt>"`,
  then the worker starts there as any `pane run` worker does (a Claude screen,
  or `--terminal`, with the worker settings, the report to main, its scope and
  the close once its branch merged), the path read from the folder the command
  ran in; `pane release` closes the pane and leaves the folder, which nothing
  made. A folder that is not there, or is neither inside the project nor in
  `git worktree list` from it, is refused saying so, and `--in` with `--card` or `--worktree` is
  refused. A worktree another pane's agent is at work in is refused, naming that pane, since two
  agents in one worktree write over each other's work, and `--card` is refused the same way for a
  card's worktree an `--in` worker is in; the project's own checkout is not, since main stands
  there, nor is an agent in a worktree nested below the one asked for. A worktree nested in the
  checkout (`.claude/worktrees/<name>`, a folder whose `.git` file points into a repository's
  `.git/worktrees/`, which a submodule's does not) is its own worktree, so its worker closes once
  its branch merged, after a restart too, or once the worktree is gone. The main checkout is offered
  too when the project was opened at a linked worktree. A worker outside the project's folder and
  `<project>.worktrees/` (`../api-mr174`) is not counted in the project's token totals on the
  manager, only in its pane's own figure.
- Given a pane with a shell and no agent, when main runs `pane send` with text
  whose command starts Claude Code (`claude ...`, by name or path, also after
  `&&`, `;` or `|`, or inside `sh -c`, `powershell -Command`, `pwsh -c` or
  `cmd /c`), then the send is refused, nothing is
  typed, and the refusal points at `pane run` with `--card`, `--worktree` or
  `--in`, since Claude typed into a pane gets none of the worker settings and
  never reports to main. The same text sent to a pane with an agent in it, or
  with a program in its foreground (a Claude opened by hand, nvim, a REPL), is
  input and goes in as it is. A program that does not read its input, `npm test`
  or `make`, leaves the text for the shell to run once it exits, and the send is
  not refused.
- Given main runs `pane run <id> --terminal "<prompt>"`, when the worker starts,
  then it is Claude Code in the pane's terminal, as every worker was before
  screens were the default; `--terminal` with `--screen` is refused
  (workers-decision-5).
- Given Dashboard on Windows, which has no screen host, when main runs a plain
  `pane run`, then the worker is Claude Code in the terminal, so an app quit
  does not end its turn; `--screen` asks for a screen there, and main's dispatch
  usage says so (workers-decision-5).
- Given a worker on a Claude screen, when its turn ends, then its own Stop hook,
  called in the app rather than through `session notify`, reports done with what
  it still waits on, and main is told exactly as for a terminal worker; a turn
  you interrupt, or a session that ends, counts as over for the review sweep
  without telling main, unless it ended with an error while at work (a refused
  or failed start among them), when main is told it stopped; a question it asks
  marks the pane blocked until answered, and arriving in the screen clears the
  pane's bell.
- Given a worker on a Claude screen, when a ship, the review sweep, the command
  screen or a project close picks or checks a pane, then that pane reads as
  running an agent, and the drawer and main's /resume refuse its conversation as
  running in that pane.
- Given main's worker on a Claude screen, when /clear, /resume, /branch or
  /rewind is typed in it, then each is refused with a notice that the worker
  stays on the conversation it was started on; /rename and Ctrl+R act on the
  worker's own conversation, not main's.
- Given a worker on a Claude screen, when `pane send` names its pane, then the
  text goes in as its next prompt rather than into the hidden shell;
  `pane release` closes the pane and ends the session.
- Given a worker on a Claude screen, when it runs a command, then it is decided
  as a terminal worker's: allow rules first, a call auto mode cannot decide asks
  in its box, a call it blocks is refused (workers-decision-5).
- Given a machine whose `~/.claude/settings.json` names no rule for the app's
  commands, when main or a worker runs `node "$DASHBOARD_COMMAND" pane …`,
  `session …` or `node "$DASHBOARD_BOARD" …`, then it runs without a question:
  the app starts every session with those rules allowed (workers-decision-9).
- Given a worker on a Claude screen, when the app restarts, then its pane comes
  back as a Claude screen on the same conversation once its project opens (the
  manager's once the pane host is back), as main's worker and, for a card's
  worker, named on the card's record again.
- Given a worker on a Claude screen in the middle of a turn, when the app quits
  or restarts, then its Claude keeps working in the screen host, as a terminal
  worker's does in the pane host; once its project opens again the screen takes
  the session back up, counted working while the turn goes on, any question it
  asked meanwhile is shown, and a turn that ended while the app was away reports
  done to main then (workers-decision-6).
- Given a project's terminals view, when you press the New Claude key or click
  New Claude in the title row, then a new worker pane opens as a Claude screen
  in the project's folder, empty, starting no session until you send the first
  prompt, and the keyboard goes to its box (workers-decision-7).
- Given a Claude screen opened by hand, when its turn ends, then its pane goes
  green and main is told nothing; `pane release` and a `pane run` into it are
  refused as for any pane running an agent that is not main's worker, until a
  main sends it work.
- Given a Claude screen opened by hand, when /clear, /resume, /branch or /rewind
  is typed in it, then each acts on its own conversation as on main's, never
  touching main's; a /resume of the conversation main is on is refused as still
  running in main, and a /rewind of the conversation goes on in a copy cut at
  the prompt.
- Given Dashboard off Windows, when a card is shipped or its review loop starts,
  then its agent is a Claude screen in the pane, as a plain `pane run`'s is; on
  Windows it is Claude Code in the terminal (`dispatch.test.ts`).
- Given a card's agent or main's worker in a terminal, when the app restarts,
  then it comes back in the terminal on its conversation; one on a Claude screen
  comes back as a screen.
- Given a Claude of yours in a terminal, when the app restarts, then it comes
  back as the pane's process on its conversation, started by pane.dispatch like
  every other agent; exiting it leaves an exited pane, and Enter gives a shell
  (actions-decision-5).
- Given a Claude screen opened by hand, when the app restarts, then it comes
  back as a Claude screen on the conversation it was last on, in the screen host
  off Windows as a worker screen is, and still not main's worker.
- Given the screen host is not running (Windows, a machine restart, a socket
  that would not open), when the app restarts, then the worker screen's turn
  ended with the app; its conversation carries on from the next prompt, or
  starts fresh under its id if the session never wrote it.
- Given the screen host was killed (earlyoom, the OOM killer) while its workers
  were mid-turn, when a worker's pane starts its session again, then the
  sessions the dead host left running are killed first and the worker carries on
  in one session, never two (workers-decision-6).
- Given a screen host that answers but will not take the app (another Dashboard
  holding it, or too slow to say what it kept), when a worker screen starts,
  then it is refused on the screen rather than run a second time in the app,
  main is told the worker stopped, and the next prompt tries again
  (workers-decision-6).
- Given a worker screen that already sent main its report, when the screen host
  dies under it, then main is told nothing more about that worker.
- Given a pane already running a worker screen, when pane.dispatch starts
  another screen there, then the first one's session is stopped before the new
  one starts.

## Open questions

- Worker numbers stay put while others close and a new one takes the lowest
  number free, so it can appear mid-list (workers-decision-1).
- A plain shell worker does not come back after a restart.
