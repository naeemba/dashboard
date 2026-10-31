# Chat: decisions

Settled questions. Read the entry before re-litigating it.

## chat-decision-1: The Claude screen answers permissions itself, in one long session

The Claude screen runs `query()` in streaming input mode, one per project page, and keeps it open:
every prompt goes into the same process, and a tool that needs a yes arrives through `canUseTool` and
waits there for the box over the prompt to answer it. Escape is `interrupt()`, which also declines
whatever was being asked.

The two projects the card pointed at were read first and neither is copied. opcode starts the CLI with
`--dangerously-skip-permissions` and stops a turn by killing the process. claude-code-webui runs a new
`query()` per message and handles a refused tool by sending the message again with the tool added to
`allowedTools`, which runs the turn twice. Both trade the question away; this screen exists to ask it.

The session starts when the project opens, as the terminal main did: the screen is the project's main
session now (workers-decision-1), and a worker's SendMessage needs a running session to arrive at.

The app keeps the conversation's id per project in `chat-sessions.json` in the app's data folder,
never in `.dashboard/`, since a conversation is personal and the board is tracked. The id is the one
each turn's `init` message reports, not one the app picks: `/clear` moves the session to a new
conversation with a new id, and only `init` says which. The next launch reads it back with
`getSessionMessages` and resumes it on the next prompt. A resume that fails forgets the id, so the
prompt after it starts fresh instead of failing the same way again.

`@path` is passed through as typed: the CLI expands it into the file's contents the way it does in a
terminal, checked against the pinned SDK by asking for `@package.json`'s version with no tools used.

## chat-decision-2: Slash commands are the session's; the screen adds the list and three of its own

Every command typed into the box goes to the session as a prompt, and the CLI runs it the way it does in
a terminal: skills, the project's commands and its own (`/compact`, `/context`, `/clear`).
Checked against the pinned SDK by sending them through `query()`. What a terminal draws as a dialog
the session answers with "isn't available in this environment"; of those, `/resume` and `/plan` are
answered by the screen itself (chat-commands.ts) and never sent. So is `/model`: bare, the session
prints a usage line instead of Claude Code's picker, so the screen lists `supportedModels()`; with a
name the session offers, it goes through `chat:configure` like the model key, so the foot and the
saved preference follow it; a name it does not offer is refused, not saved as the next start model.

The list comes from `supportedCommands()`, which only a running session answers; the session is
started with the project, so the list is there by the first slash.

`/resume` lists the folder's conversations with `includeWorktrees: false`. A project's workers run in
its worktrees, and with them in the list the project's own conversations are lost among theirs.

Plan mode is on the edits key, after accepting, the terminal's order. The plan arrives as the ask for
`ExitPlanMode`, drawn as markdown with Claude Code's three answers. Each yes sends a `setMode` with
it, because the session leaves plan mode for `default` on a bare allow and the terminal's first
answer goes on accepting edits.

## chat-decision-3: /rewind forks the conversation and keeps the code half in the session's checkpoints

`/rewind` is the screen's own command, as `/resume` is: the session answers it with "isn't available
in this environment". Every session starts with `enableFileCheckpointing`, so restoring code is
`rewindFiles` with the picked prompt's id, the one its transcript gives it. A dry run first gives the
count the notice prints; the real rewind reports only links it would not follow. Checked against the
pinned SDK: a file written by the second prompt went back to the first prompt's text, and the same
call worked on a resumed session before any prompt was sent.

Restoring the conversation closes the session and starts one with `resume`, `resumeSessionAt` set to
the message before the prompt, and `forkSession`, so the old conversation stays whole in `/resume`.
The fork names its new conversation only in the next turn's `init`, so until then main reads the
remembered one cut at that message; any change of conversation drops the cut. While the cut waits,
`/resume` marks no conversation as current, so picking the one just cut goes through `chat:resume`
and puts it back whole. Before the first prompt there is nothing to resume, and it is a new
conversation.

Claude Code also summarizes from or up to a prompt; that is left out. Esc Esc is left out too: Escape
is the interrupt key, and a double press would need a timing rule beside it.

## chat-decision-4: The @ list is git's files, not the SDK's file suggestions

The SDK has a `file_suggestions` request, but only as an internal type: the `Query` has no method to
send it. So the screen lists the files itself, from main, with `git ls-files -z --cached --others
--exclude-standard`, less `git ls-files -z --deleted`, and matches them in chat-mentions.ts. Folders
are not offered. A folder that is not a repository lists nothing rather than walking node_modules.
