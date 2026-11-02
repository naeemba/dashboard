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

## chat-decision-2: Slash commands are the session's; the screen adds the list and four of its own

Every command typed into the box goes to the session as a prompt, and the CLI runs it the way it does in
a terminal: skills, the project's commands and its own (`/compact`, `/context`, `/clear`).
Checked against the pinned SDK by sending them through `query()`. What a terminal draws as a dialog
the session answers with "isn't available in this environment"; of those, `/resume` and `/plan` are
answered by the screen itself (chat-commands.ts) and never sent. So is `/model`: bare, the session
prints a usage line instead of Claude Code's picker, so the screen lists `supportedModels()`; with a
name the session offers, it goes through `chat:configure` like the model key, so the foot and the
saved preference follow it; a name it does not offer is refused, not saved as the next start model.
`/effort` is the screen's too: bare, the session has no picker to show here, so the screen lists auto
and low to max; a named level goes through `chat:configure` like `/model`, which sends it to the
session's flag layer with `applyFlagSettings`, so the foot and the saved preference follow it. Until
one is picked the foot says `default effort` and no row is marked, because the session then runs at
the level in the settings file, which the screen does not read. Auto is not that: it clears the flag
layer, which puts the session on the model's default over the settings level, and a restart after it
sends the same clear, since the start option cannot say null.
`/diff` is the screen's too: the SDK has no review of a session's edits, so the screen builds one from
the conversation's own Edit, Write and MultiEdit calls that worked (chat-diff.ts), not from git, so
it shows what Claude changed and nothing else in the folder. The transcript is all it reads, so a
code-only `/rewind`, which leaves the conversation alone, leaves the edits it put back on the sheet.

The list comes from `supportedCommands()`, which only a running session answers; the session is
started with the project, so the list is there by the first slash.

`/resume` lists the folder's conversations with `includeWorktrees: false`. A project's workers run in
its worktrees, and with them in the list the project's own conversations are lost among theirs.
A pick a worker pane runs is refused, answered as `{ refused }` for the status line: the drawer
can resume one of main's older conversations into a pane in the project folder, and two Claudes on
one conversation each write their own turns into it (drawer-decision-1).

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
remembered one cut at that message; any change of conversation drops the cut, but `/branch` keeps
it: the copy is forked with `upToMessageId` at the cut, so it holds only what the rewind left. While the cut waits,
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

## chat-decision-5: The task strip's background key is Alt+B, and an ended pick is refused

The terminal backgrounds tasks with Ctrl+B, but Ctrl+B is the board's mode key here, and a mode key
passes through to the pane only in its own mode (keys-rule-1). So the strip's keys are Alt+T to pick,
Alt+X to stop and Alt+B to background.

A key pressed for a picked task whose row has since left the strip is refused with a notice, not
turned into "every task" for Alt+B or "nothing" for Alt+X. The press meant that one task; falling back
would background agents nobody picked. The pick lets go once the strip is empty, so the refusal only
lasts while other tasks still run, which a background command can stretch across turns.

## chat-decision-6: /mcp is the screen's own, on the session's MCP calls

Sent as a prompt, `/mcp` gets back a count ("2 MCP server(s): 1 connected, 1 connecting, …") and a
pointer to the terminal, so the screen answers it itself, as it does `/resume`. The list is
`mcpServerStatus()`; Reconnect is `reconnectMcpServer`, Disable and Enable are `toggleMcpServer`.
Checked against the pinned SDK: a connected server went to `disabled` and back to `connected`, and a
name the session does not have throws "Server not found". A failure is printed as the error line.

It is not refused under a running turn, as `/resume` and `/rewind` are: neither call touches the
conversation. Claude Code's dialog also lists each server's tools and signs in to one that needs it;
the sheet shows the tool count and the status only.

## chat-decision-7: A message sent while Claude is busy waits in the session's own queue

Main stamps every prompt with a uuid. The CLI queues one that arrives mid-turn itself and reports it
by that uuid in `command_lifecycle` messages: `queued`, then `started` and `completed`, or `cancelled`.
The screen draws a prompt sent while busy grey under the conversation and moves it into the
conversation on any state past `queued`, since one folded into the running turn may report `completed`
without a `started`. Up in the empty box withdraws the last one through `cancelAsyncMessage`, which
answers false once the session has taken it. A `/clear` the session runs itself clears the screen
but keeps the grey prompts, since the process holding them goes on; a reset from the screen (a new
conversation, `/resume`, a rewind) stops the session and drops them.

Neither the message type nor the method is in the pinned SDK's types (0.3.316); both were checked
against it by sending two prompts into a running turn and cancelling the second: it was reported
`cancelled` and never ran, the first ran after the turn. A screen that opens while a prompt waits
does not see it: the queue lives in the session, and `chat:read` only reads the transcript.

## chat-decision-8: /btw is the session's own side question, through a call the SDK does not declare

`/btw` is the screen's own command: sent as a prompt it would join the conversation, which is what it
must not do. The pinned SDK has `askSideQuestion` on every query, the control request Claude Code's
/btw makes, but leaves it out of `sdk.d.ts`, so main reaches it through a cast. Checked against the
pinned SDK: asked while a Bash call was running, it answered from that turn's prompt in under a
second, and `getSessionMessages` afterwards held nothing of it. A release that drops the call fails
the ask with an error on the screen and nothing else.

The card's other way, a second `query()` resuming the conversation with `forkSession` and no tools,
is left out: it starts a second process for every question, where the call asks the one running.

## chat-decision-9: The stash key is Alt+S, and Up walks the stash

Claude Code stashes the box with Ctrl+S, but Ctrl+S opens the project picker here, before any
screen sees it. So the stash key is Alt+S, beside the other Claude screen keys.

The stash is a list Up walks rather than a slot a second press restores: Up from the box reaches
the newest stashed draft first, then the older ones, then the prompts sent. The last 10 are kept,
for as long as the app runs, across new conversations; a draft leaves the stash when it is sent.
Images attached to the box are not stashed, and stay attached.

## chat-decision-10: The context popup reads the measure the meter already has, and sits above the meter

The breakdown comes from the same `getContextUsage({ detail: 'summary' })` answer the status line's
meter reads after each turn, so opening the popup asks main for nothing: it shows the last measure and
says when it was taken. `/context` is the screen's own command and never reaches the session, which
would answer it as text in the conversation.

A row is classified on the SDK's `kind` and coloured by its `id`, never by its English name. A
`deferred` row, and an MCP tool with `isLoaded: false`, is a tool schema that is not in the window, so
it is left out rather than shown apart: the popup answers what fills the window. The SDK's `color` is
a key of Claude Code's terminal theme, not a colour a page can paint, so each id takes one of the
app's theme colours instead.

The popup is drawn above what opened it, lined up with whichever of its edges faces the middle of the
window (`popup-placement.ts`). The context meter sits on the right of the foot, so its popup grows
leftwards; the workers count on the left would grow rightwards from the same code, so the two never
cover each other's anchor. The workers popup is still the centred search sheet; `anchored-popup.ts`
takes rows with a choice, so moving it over is a change of caller, not of the popup.

## chat-decision-11: A streaming reply is cut at a paragraph break, and drawn whole when it cannot be

The streaming block draws the text before its last cut once, as it settles, and redraws only what
follows each frame (`chat-live-view.ts`). A cut (`chat-live-cut.ts`) is the start of a line after a
blank line, outside a code fence, that cannot carry on the block above it: not indented, not a list
item, not a quote. Markdown drawn in two pieces there is the same HTML as drawn whole, which the
test checks for every prefix of a reply holding a table, fences, a loose list and a link across a
line break.

A reply holding a link definition (`[name]: url`, also in a list item or a quote), an HTML comment,
or a `<pre>`, `<script>`, `<style>` or `<textarea>` line is drawn whole every frame, as before: a
definition applies to links anywhere in the text, and those HTML blocks run on past a blank line.
Other HTML lines end at one, so they still cut. A fence opened in a list item or a quote, or a fenced
line less indented than its opener, is drawn whole too: the scanner follows top-level fences only, and
the container can end a fence where it would run on. Telling the refused cases apart from a safe cut
costs more code than they are worth; Claude rarely writes any of these. The finished reply is an entry and is always drawn whole.

What is still redrawn every frame: an open code fence, highlighted whole each frame until it closes,
and a list still growing, since a blank line between items cannot be cut.
