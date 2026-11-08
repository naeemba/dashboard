# Actions: inventory and plan

Every entry point that changes app state today, by noun and verb, and the
action each one moves behind (actions-decision-4). Line numbers are as of the
card that wrote this list; each noun's card corrects its own rows as it moves
them. **Bypass** marks a row that does the work itself rather than call an
action; `src/main/actions/bypasses.test.ts` pins the calls and wrappers it
lists. A **yes** row with no pin there (the `chat:*` handlers, `pane send`,
the restart's reopenings) is held by actions-rule-1 alone.

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
| claim | pane.claim, `actions/pane/claim.ts`, bound in `session-requests.ts`; opens through pane.open | CLI `pane claim` | no; `--project` opens through `openProject`, project.open's row |
| open (add) | pane.open, `actions/pane/open.ts` | IPC `pane:add` (`workers/worker-channels.ts`), the drawer, pane.claim | no |
| send | pane.send, `actions/pane/send.ts` | CLI `pane send` | no |
| release | pane.release, `actions/pane/release.ts`, bound in `session-requests.ts`; closes through pane.close | CLI `pane release` | the throwaway's removal is worktree.remove's row |
| close | pane.close, `actions/pane/close.ts` | IPC `pane:close`, pane.release | no |
| agent exited | `releaseAgentPane`, `main.ts` | the shell's exit | yes, and stays an event, not a request |
| restart a shell | `pty:restart`, `panes/pane-channels.ts:42` | IPC (Enter on an exited pane) | yes |

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

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| open | `openProject`, `main.ts:469` | IPC `projects:open` (`main.ts:450`, the picker), CLI `project open` (`project-requests.ts:64`), CLI `pane claim --project` | one function, three doors, no action |
| close | `closeProjectSlot`, `main.ts:497` | IPC `projects:close` (`main.ts:494`, the close key), CLI `project close` (`project-requests.ts:80`) | the refusal is checked by each door, `closeRefusal`, then the close |
| focus | `project-requests.ts:71`, `landOnPane` | CLI `project focus`, a notification click | yes |
| add, set, remove | `projectEdit`, `projects/project-cli.ts:149`, written by `project-program.ts:34` | CLI `project add/set/remove` | the file alone, app closed or not; stays the command's |
| list on open | `listOpenedProject`, `main.ts:482` | every open | part of project.open |

### session (a main's chat and a pane's conversation)

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| start main | `chats.start`, `main.ts:398` and `:569` (`startMainsWaitedOn`), `chats.startMain` from `project open` | restart, CLI `project open` | yes |
| reset | `chat:reset`, `chat/chat-sessions.ts:675` | IPC (/clear) | yes |
| resume | `chat:resume`, `chat-sessions.ts:688` | IPC (/resume) | yes |
| branch | `chat:branch`, `chat-sessions.ts:735` | IPC (/branch) | yes |
| rewind | `chat:rewind`, `chat-sessions.ts:754` | IPC (/rewind) | yes |
| rename | `chat:rename`, `chat-sessions.ts:525`; `sessions:rename`, `drawer-ipc.ts:29` | IPC (/rename, the drawer) | yes, two writers of one label |
| configure | `chat:configure`, `chat-sessions.ts:593` | IPC (model, mode, effort) | yes |

`chat:send`, `chat:interrupt`, `chat:answer` and the reads are the
conversation itself, not changes to app state.

### card

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| move | card.move, `actions/card/move.ts` | IPC `card:move`, CLI `board move` into Ship or Review | no |
| move, any other column | `board-cli.ts:51` (`asksApp` false) writes the file | CLI `board move` | by design: works with the app closed (actions README, Known limits) |
| move, the board's own write | `board:write`, `app/project-files-ipc.ts:42` | IPC (every board edit, then `card:move` for a column change) | the write is the board's; the entry is card.move's |
| move into Ship on the branch | `commitShipMove`, `ship/ship-flow.ts:46` | card.ship | inside card.ship |
| move into Review | `editProjectBoard`, `ship/review-flow.ts:97` | sweep | then card.move with `automatic`; the write itself bypasses |
| add, set, comment, edit, delete | `board-cli.ts`, `board:write` | CLI, IPC | file edits through `board-store.ts` (board-rule-1); no action needed until one starts something |

### settings and notes

| Verb | Where | Doors | Bypass |
|---|---|---|---|
| settings.write | `writeSettings`, `main.ts:157`, `:560` (`settings:write`), `:867` (a remote join saving its address) | launch, IPC, IPC `host:connect` | yes: three writers of one file |
| notes.write | `notes:write`, `project-files-ipc.ts:56`; `ink:write` `:64` | IPC | one writer each; no action needed |

## The action set

One row per noun.verb, and what it decides that its callers do not.

| Action | Decides |
|---|---|
| pane.dispatch | screen or terminal, worker or yours, new or resumed (`paneKind`); every resume, including the shell's and the drawer's, so no caller types `claude --resume` |
| pane.claim | which project and pane, who claimed it |
| pane.open | the lowest free index, a shell or New Claude |
| pane.send | screen prompt or shell bytes |
| pane.release | whether the pane is the asker's, and whether its throwaway worktree goes |
| pane.close | that the pane is a worker; ends a card record's claim on it |
| pane.restore | what each saved pane comes back as after a restart: shell, adopted shell, screen or dispatch |
| worktree.make | card, throwaway or again; the branch it names; whether it fetches and takes the project's queue itself (only a throwaway) |
| worktree.remove | per door, forced or not, queued or not, logged or not (`removalOf`); the keeper refuses with changes and kills the shells and closes the screens in it |
| project.open | the dialog or a path, a dead page opened over, its main started or not |
| project.close | `closeRefusal`, once, for the key and the command |
| project.focus | which pane to land on |
| session.start | whether a main starts at open (`startsAtOpen`) |
| session.reset, .resume, .branch, .rewind | `keepsItsConversation`: refused on main's worker screen |
| session.rename | one label for the chat and the drawer |
| settings.write | the one writer of settings.json, and the shell it picks |

## The plan

One card per noun, in this order, each landing before the next starts, so no
two fight over `main.ts`:

1. **pane** (done): pane.dispatch has its doors, the shell's and the drawer's
   resume are behind it, and claim, open, send, release, close and restore are
   actions. Left: the agent's exit and `pty:restart`.
2. **worktree** (done): make and remove behind one action each, the dialog,
   the throwaway and the review on it, and a card's pane written onto its
   record in one place, the keeper's `givePane`.
3. **project**: open, close and focus, one refusal for the key and the command.
4. **session**: start, reset, resume, branch, rewind, rename.
5. **settings**: settings.write as the one writer.

Each card lowers its rows in `bypasses.test.ts` to what it left behind. card
has no card: its writes are the board's (board-rule-1), and the moves that start
something already go through card.move.
