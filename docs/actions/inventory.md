# Actions: inventory and plan

Every entry point that changes app state today, by noun and verb, and the
action each one moves behind (actions-decision-4). Line numbers are as of the
card that wrote this list; each noun's card corrects its own rows as it moves
them. **Bypass** marks a row that does the work itself rather than call an
action; `src/main/actions/bypasses.test.ts` pins the calls and wrappers it
lists. A **yes** row with no pin there is held by actions-rule-1 alone.

Doors: **IPC** is a channel the screen asks (keys, buttons and clicks all reach
main this way), **CLI** a `dashboard` command over the session socket,
**sweep** the five-second tick in `main.ts:323`, **restart** a project opening
with what the last run left.

## The inventory

### pane

Moved behind the pane actions by the pane card; the rows say where each door is
now.

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| dispatch | pane.dispatch, `actions/pane/dispatch.ts`, bound in `pane-actions.ts` | ship and review (`attachPane`), `pane run` (`startWorker`), pane.open, pane.restore | no |
| resume as a shell | pane.restore, then pane.dispatch | restart | no: Claude Code is the pane's process (actions-decision-5) |
| resume from the drawer | pane.open with `resume`, then pane.dispatch | IPC `sessions:resume`, `drawer/drawer-ipc.ts` | no |
| come back as a screen | pane.restore, `actions/pane/restore.ts` | restart | no |
| adopt a kept shell | pane.restore | restart | no |
| claim | pane.claim, `actions/pane/claim.ts`, bound in `session-requests.ts`; opens through pane.open | CLI `pane claim` | no; `--project` opens through project.open |
| open (add) | pane.open, `actions/pane/open.ts` | IPC `pane:add` (`workers/worker-channels.ts`), the drawer, pane.claim | no |
| send | pane.send, `actions/pane/send.ts` | CLI `pane send` | no |
| release | pane.release, `actions/pane/release.ts`, bound in `session-requests.ts`; closes through pane.close | CLI `pane release`, the finished-worker sweep (`auto-release.ts`) | the throwaway's removal is worktree.remove's row |
| close | pane.close, `actions/pane/close.ts` | IPC `pane:close`, pane.release | no |
| agent exited | `releaseAgentPane`, `main.ts` | the shell's exit | yes, and stays an event, not a request |
| restart a shell | pane.restart, `actions/pane/restart.ts` | IPC `pty:restart` (Enter on an exited pane), pane.dispatch's shell started over | no |

Fold, zoom, focus and the layout are the renderer's own, saved through
`session:write` (`app/session-store.ts:51`); main owns none of them, so they are
not pane actions. `pty:input`, `pty:resize`, `pty:pause` and `pty:resume` are
the byte stream, not changes of state.

### worktree

Moved behind the worktree actions by the worktree card; the rows say where each
door is now. Every door's call is a port in `actions/worktree/worktree-actions.ts`.

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| make, a card's | worktree.make `card`, `actions/worktree/make.ts`, the ship's `makeWorktree` port | IPC, CLI (card.ship) | no |
| make again, a reviewed card's | worktree.make `again`, the review's `addWorktree` port | sweep, card.review | no |
| make, a throwaway | worktree.make `throwaway`, `makeWorktree` in `session-requests.ts` | CLI `pane run --worktree` | no |
| make, /create-task | `create-task-program.ts:71` | the `/create-task` skill's program | outside the app; stays |
| remove | worktree.remove `dialog`, `actions/worktree/remove.ts`, from `worktree:remove` (`ship/worktree-channels.ts`) | IPC (worktree dialog's `d`, the manager's list) | no |
| remove, a throwaway | worktree.remove `release`, pane.release's `removeWorktree` port | CLI `pane release` | no |
| remove, a reviewed card's | worktree.remove `review`, the review's `removeWorktree` port, in `review-flow.ts` | sweep, card.review | no |
| a card's pane on its record | `givePane`, `ship/worktree-keeper.ts` | a ship, a review, a card's `pane run`, pane.restore | a record write under pane.dispatch's callers, not a door |
| drop dead records | `worktrees.dropDead`, `main.ts` and `worktree:list` | sweep, IPC | a read that tidies; stays |

### project

Moved behind the project actions by the project card; the rows say where each
door is now. Every door's call is in `actions/project/project-actions.ts` or
`projects/project-requests.ts`.

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| open | project.open, `actions/project/open.ts`; main's `placeProject` its port | IPC `projects:open` (the picker, `registerProjectChannels`), CLI `project open`, CLI `pane claim --project` (`openForClaim`) | no |
| close | project.close, `actions/project/close.ts`; main's `closeProjectSlot` its port | IPC `projects:close` (the close key, asked twice), CLI `project close` | no: `closeRefusal` is asked only here |
| focus | project.focus, `actions/project/focus.ts`; `landOnPane` its port | CLI `project focus`, a notification click (`pane-channels.ts`) | no |
| add, set, remove | `projectEdit`, `projects/project-cli.ts:149`, written by `project-program.ts:34` | CLI `project add/set/remove` | the file alone, app closed or not; stays the command's |
| list on open | `listOpenedProject`, in `placeProject` | every open | part of project.open |

### session (a main's chat and a pane's conversation)

Moved behind the session actions by the session card; the rows say where each
door is now. Every door's call is in `actions/session/session-actions.ts`, and
what each action asks of the session is `actionPorts` in `chat/chat-sessions.ts`.

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| start | session.start, `actions/session/start.ts`; `chats.actionPorts.start` its port | restart (`startMainsWaitedOn`, `from: 'restart'`), a kept worker screen taken back (`screen-workers.ts`, `'kept'`), CLI `project open` (project.open's `startMain`, `'command'`) | no |
| reset | session.reset, `actions/session/reset.ts` | IPC `chat:reset` (/clear) | no |
| resume | session.resume, `actions/session/resume.ts` | IPC `chat:resume` (/resume) | no |
| branch | session.branch, `actions/session/branch.ts` | IPC `chat:branch` (/branch) | no |
| rewind | session.rewind, `actions/session/rewind.ts` | IPC `chat:rewind` (/rewind) | no |
| rename | session.rename, `actions/session/rename.ts` | IPC `chat:rename` (/rename), IPC `sessions:rename` (the drawer's F2) | no: one label, written in both places (actions-decision-7) |
| configure | session.configure, `actions/session/configure.ts` | IPC `chat:configure` (model, mode, effort, fast) | no |
| started by use | `running`, `chat-sessions.ts` | a prompt, a worker's report, the screen's first measure, the slash, model and MCP lists | the conversation itself, not a door |

`chat:send`, `chat:interrupt`, `chat:answer` and the reads are the
conversation itself, not changes to app state.

### card

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| move | card.move, `actions/card/move.ts` | IPC `card:move`, CLI `board move` into Ship or Review | no |
| move, any other column, or any move on a worktree's board | `board-cli.ts:53` (`asksApp` false) writes the file | CLI `board move` | by design: works with the app closed (actions README, Known limits) |
| move, the board's own write | `board:write`, `app/project-files-ipc.ts:42` | IPC (every board edit, then `card:move` for a column change) | the write is the board's; the entry is card.move's |
| move into Ship on the branch | `commitShipMove`, `ship/ship-flow.ts:46` | card.ship | inside card.ship |
| move into Review | `editProjectBoard`, `ship/review-flow.ts:97` | sweep | then card.move with `automatic`; the write itself bypasses |
| start, into Doing with its branch | card.start, `actions/card/start.ts` | card.ship, `pane run --card` | no |
| follow its pull request | card.follow, `actions/card/follow.ts` | the pull-request sweep (report, board shown, timer) | no; the move is card.move with `automatic` |
| add, set, comment, edit, delete | `board-cli.ts`, `board:write` | CLI, IPC | file edits through `board-store.ts` (board-rule-1); no action needed until one starts something |

### settings and notes

settings moved behind settings.write by the settings card;
`tidySettingsFile`'s launch tidy rewrites the file's own lines, not the
settings, and stays.

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| settings.write | settings.write, `actions/settings/write.ts`, bound in `settings-actions.ts`; main's `writeSettings` its `writeFile` port | launch (`keepHostToken`), IPC `settings:write`, IPC `host:connect` (`saveSettings`) | no: the shell is picked again on every write, the join's included |
| notes.write | `notes:write`, `project-files-ipc.ts:56`; `ink:write` `:64` | IPC | one writer each; no action needed |

### update

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| check | update.check, `actions/update/check.ts` | launch and every six hours, IPC `update:check` (the dialog) | no |
| download | update.download, `actions/update/download.ts` | IPC `update:download` | no |
| restart | update.restart, `actions/update/restart.ts` | IPC `update:restart` | no |
| install | update.install, `actions/update/install.ts`; the swap and relaunch pinned in `bypasses.test.ts` | the quit question's answer (`app-window.ts`) | no |

### processes

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| install-slices | processes.install-slices, `actions/processes/install-slices.ts`, bound in `processes/launch-scopes.ts` | launch, once systemd answers | no |

## The action set

One row per noun.verb, and what it decides that its callers do not.

| Action | Decides |
|---|---|
| pane.dispatch | screen or terminal, worker or yours, new or resumed (`paneKind`); every resume, including the shell's and the drawer's, so no caller types `claude --resume` |
| pane.claim | which project and pane, who claimed it |
| pane.open | the lowest free index, a shell or New Claude |
| pane.send | screen prompt or shell bytes; an agent a main sends work becomes its worker, told to report there |
| pane.release | whether the pane is the asker's, and whether its throwaway worktree goes |
| pane.close | that the pane is a worker; ends a card record's claim on it |
| pane.restore | what each saved pane comes back as after a restart: shell, adopted shell, screen or dispatch; a kept shell not taken back has its scope stopped |
| pane.restart | refused while a shell runs; the old shell's scope stopped once the new one has its own |
| worktree.make | card, throwaway or again; the branch it names; whether it fetches and takes the project's queue itself (only a throwaway) |
| worktree.remove | per door, forced or not, queued or not, logged or not (`removalOf`); the keeper refuses with changes and kills the shells and closes the screens in it |
| project.open | a missing folder refused, a dead page opened over, its main started only for the command; the dialog stays the picker's door's |
| project.close | `closeRefusal`, once, for the key and the command; only a check before the key's question; every pane's scope stopped after the close |
| project.focus | which pane to land on: main, or the banner's |
| session.start | whether a main starts at a restart (`startsAtOpen`); the command's start answers once main can be reached |
| session.reset, .resume, .branch, .rewind | `keepsItsConversation`: refused on main's worker screen; a resume of a conversation running elsewhere (`runningElsewhere`); a rewind's dry run before the code goes back |
| session.rename | one label for the chat and the drawer: both doors write the transcript's title and the drawer's row |
| session.configure | the choice kept for the next start, and the running session moved onto it |
| settings.write | the one writer of settings.json, and the shell it picks |
| update.check | whether the release is newer, whether this machine can install it (refused if not, never offered), leaving one being installed alone; the settings row gates only the schedule |
| update.download | that there is a release to download; a failure kept on the state for the dialog |
| update.restart | that a download is staged and is the release; the update armed and the quit asked for |
| processes.install-slices | which slice units are missing, never one that is there; a reload only when one was written |
| update.install | Quit swaps the armed update in and relaunches; any other answer forgets it; no relaunch when the swap fails |

## The plan

One card per noun, in this order, each landing before the next starts, so no
two fight over `main.ts`:

1. **pane** (done): pane.dispatch has its doors, the shell's and the drawer's
   resume are behind it, and claim, open, send, release, close and restore are
   actions, and so is pane.restart. Left: the agent's exit.
2. **worktree** (done): make and remove behind one action each, the dialog,
   the throwaway and the review on it, and a card's pane written onto its
   record in one place, the keeper's `givePane`.
3. **project** (done): open, close and focus behind one action each, and one
   refusal for the key and the command.
4. **session** (done): start, reset, resume, branch, rewind, rename and
   configure behind one action each, and one name for a conversation in
   /resume and the drawer.
5. **settings** (done): settings.write as the one writer, for launch, the
   settings screen and a remote join.

Each card lowers its rows in `bypasses.test.ts` to what it left behind. card
has no card: its writes are the board's (board-rule-1), and the moves that start
something already go through card.move.
