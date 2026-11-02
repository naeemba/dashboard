# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, rewinds to an earlier prompt, and shows images, PDFs and the agents
Claude has running.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

A Claude Code conversation drawn as a page rather than a terminal: tables as
tables, code highlighted with a copy button in each block's corner (the copy key
copies the selected entry's first block, then the next on each press; a tool
call's or message's blocks once it is unfolded), a command run with ! as the
line typed and a block of what it printed, a message Claude Code put in the
conversation itself — an agent finishing, a subagent's report — as one folded
line that a click or the unfold key opens, a long message you sent — a pasted
log — as its first 6 lines and a row counting the rest, opened the same way
(Claude still gets all of it), an image Claude carried inline drawn inline (one
from the web is a link, so nothing is fetched until you click it), an edit as a
diff. It runs in the project's folder with the project's own CLAUDE.md,
settings, skills, hooks and MCP servers, the same as claude typed in a pane, as
the project's main session. It starts when the project opens.

The boxes take the terminal's readline keys: deleting the word before the caret,
back to the start of the line or on to its end keeps what went, and the yank key
puts it back; kills one straight after another join into one, the yank-pop key
straight after a yank swaps it for the kill before, and undo takes any of them
back.

Enter sends what is in the box and Shift+Enter starts a new line; you can send
while Claude is working: the message waits grey under the conversation until the
turn gets to it, and Up in the empty box takes the last one waiting back to
edit. Paste an image or drop one on the screen to attach it; any other file or
folder dropped goes in the box as an @ mention, so Claude reads it — a thumbnail
of each sits over the box, up to 5 MB of images a prompt, and Backspace in an
empty box takes the last one off. A click on an image, or the image key, shows
it full size: the selected entry's first one, or with nothing selected the first
one attached. Write @ and a path to point Claude at a file; @ opens a list of
the project's files that narrows as you type, and Tab or Enter puts the one
picked in the box. A PDF mentioned that way shows as a [PDF File] tile with its
name, and so does one Claude reads, once its Read call is unfolded; a click or
the image key opens it in the built-in PDF viewer, Escape puts it away, and one
missing or over 5 MB says so on the tile. Up and Down on the box's first or last
line bring back the prompts sent before, the stash key empties the box and Up
brings the draft back first (the last 10 stashed), and the history key searches
every prompt sent in the project's 20 most recent conversations, the terminal's
too, and puts the one picked in the box. After a turn Claude may suggest what
you will ask next: it shows grey in the empty box, Tab puts it there to edit or
send, and typing anything else replaces it. The editor key opens what is in the
box in the project's nvim; save it there and come back, and the box holds what
you saved.

A slash opens the list of commands, the same ones claude has in a pane: its own,
your skills and the project's. The arrows walk it, Tab fills the box with the
one picked, and Enter runs it, or fills the box when it takes arguments.
Thirteen are this screen's own: /diff shows every change Claude made to a file
in this conversation, file by file, on a sheet the arrows scroll and Escape puts
away; /btw asks a side question, answered at once even mid-turn, from the
conversation so far and without tools, in a sheet that Escape or Enter puts away
and that never joins the conversation; /copy puts Claude's last reply on the
clipboard as the markdown it wrote, or the one N back with /copy N; /model lists
the session's models with the one it is on marked and switches to the one
picked, or straight to the one named after it; /effort lists auto and low to max
the same way, for how hard Claude thinks from the next turn on; /fast and the
fast key turn fast mode on or off, /fast on and /fast off set it, faster output
from the same model at a higher price, and the foot adds fast to the model while
it is on; /resume lists the project's earlier conversations to carry on from,
newest first with the one you are on marked and a box to search them; /rewind
lists the prompts sent, newest first, and puts the code, the conversation or
both back to just before the one picked, with that prompt back in the box when
the conversation went back; /rename names the conversation you are on, the name
/resume then lists it by; /mcp lists the session's MCP servers with how each
stands and reconnects, disables or enables the one picked; /branch carries on in
a copy of this conversation, called whatever follows it, if anything, and leaves
the original in /resume; /export copies the conversation as text to the
clipboard or saves it to a .txt file in the project's folder, or to the file
named after it, never over one already there; and /plan switches to plan mode,
sending anything after it as the prompt. /clear starts over like the new
conversation key. The word ultrathink anywhere in a prompt asks for deeper
thinking on that turn alone.

Every tool call is folded to one line: a mark saying whether it is still
running, worked or failed, the tool and what it touched. The selection keys walk
the conversation one entry at a time, scrolling as they go, and the unfold key
opens the call under the selection to show its command or its diff and what came
back; a click does the same.

When Claude wants to use a tool that needs your say, a box over the prompt names
it and shows what it would do, and the arrows and Enter answer it. A tool asked
about often offers a row that stops it asking again this session, and every one
has a row to say no with a reason typed into it, which Claude reads. In plan
mode Claude works the plan out without changing anything and puts it up in the
same box: go ahead accepting edits, go ahead asking before each one, or keep
planning, with what to change typed in. A question Claude asks you comes the
same way, one question at a time, with a row to type an answer of your own. A
form an MCP server sends comes the same way too, a field at a time, and a
sign-in link it sends has a row to open it; every step of either has a row to
decline, and a required pick of several or a link that is not a web page has
only that. If the window is behind something else when either arrives, a
notification says so and clicking it lands here. Escape stops Claude where it is
and gives up on anything it was asking; with the command list open it only
closes the list.

While Claude works, a line over the box says whether it is thinking, for how
long and roughly how many tokens have come down, and its answer flows in a few
characters at a time. What it thought is folded to a Thinking line in the
conversation, unfolding to a summary of it.

A pane named in the conversation — what pane run printed, a worker's report — is
a link: a click lands on that pane, on its own project's page, or says the pane
is not open; numbers are reused, so a link to a pane closed and opened again
lands on whatever holds the number now.

When a worker this session dispatched finishes its turn, the app tells Claude so
in the conversation, queued behind whatever it is doing.

While the session has workers open the foot counts them by how they stand,
working, blocked, done or idle; a click on the count or the workers key opens a
list of them, the manager's across every project, that keeps up while it is
open: the arrows walk it, Enter lands on the pane and Escape closes it. Above
the working line, a strip lists the agents, workflows and background commands
Claude has running, each under the one that started it, with its tool calls,
tokens, time and last tool so far; a task leaves the strip when it ends. It
lists only what started while the screen was open, since a saved session keeps
none of it. The task key picks a row in the strip, the next each press and none
after the last; a click picks the row too. The stop key stops the picked task,
and the background key sends it to the background so the turn goes on without
waiting for it; with no row picked, the background key sends every foreground
task there, as Ctrl+B does in the terminal.

The row under the box holds what Claude Code's status line does: on the left the
model, whether edits are asked about or accepted, the effort level (default
effort until one is picked: the level in your settings), or ultrathink while
such a turn runs, and whether Claude is working; on the right meters for the
context, the plan's five-hour limit and when it resets, and the seven-day limit,
each green, then yellow from 70 and red from 90, and the version. The model key
walks the models and the edits key walks asking, accepting, planning and auto,
both for the next thing Claude does; the foot follows a mode Claude moves to by
itself, such as accepting edits once a plan is approved. A second screen on the
same page shows the same conversation, questions and choices, and either can
answer.

The conversation outlives the app: the next launch shows it again and carries on
from it as the project opens. The new conversation key starts over; the old one
stays in Claude Code's own history on disk. A very long conversation scrolls
fine, but only the part near the screen is drawn properly at any moment, so fast
scrolling shows plain text for a moment first.

## Files

Folders: `src/main/chat/`, `src/shared/chat/`, `src/renderer/chat/`.

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`, `chat-elicitation.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`, `chat-notices.ts`, `chat-export-target.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-diff.ts`, `chat-events.ts`, `chat-fold.ts`, `chat-tags.ts`, `chat-reveal.ts`,
  `chat-stamp.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`,
  `chat-mentions.ts`, `chat-rewind.ts`, `chat-rewind-view.ts`, `chat-screen-commands.ts`,
  `chat-screen-dispatch.ts`, `chat-attachments.ts`,
  `chat-line-editing.ts`,
  `chat-mcp.ts`, `chat-mcp-view.ts`, `chat-rename.ts`, `chat-queue.ts`, `chat-queue-view.ts`, `chat-btw-view.ts`,
  `chat-hooks.ts`, `chat-export.ts`, `chat-export-view.ts`, `chat-workers-view.ts`, `chat-pane-links.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given an MCP server asks for a form or a sign-in link, when the session passes it on, then the same box walks the form a field at a time, or opens the link, and every step can decline; a yes or no or a pick opens on the server's default, a typed answer outside the field's bounds keeps the box open saying what it takes, a required multi-select or a link that is not http(s) can only be declined, an optional multi-select can also be skipped, and Escape or the session ending reaches the server as a cancel, not a decline; the server's other dialogs are not declared, so Claude Code keeps its own fallback.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question is given up on: a tool call is declined, a server form cancelled.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given a conversation is under way, when you send `/branch`, then the page carries on in a copy of it and the original stays in `/resume`.
- Given you type `/model` with a name the session does not offer, when you send it, then it is refused and not saved.
- Given Claude is working, when you send a message, then it waits grey under the conversation until the session takes it, and Up in the empty box takes it back.
- Given a message names a PDF, when it is drawn, then it is a tile that opens in the built-in viewer.
- Given you type `/effort high`, when you send it, then the next turn runs at high and the foot says `high effort`; `ultrathink` in a prompt shows in the foot while its turn runs.
- Given you type `/fast` or press Alt+F, when fast mode was off, then the session turns it on and the foot shows `· fast` after the model; again turns it off. `/fast on` and `/fast off` set it rather than toggle, and the foot starts from what the session reports, so one already fast from the settings file shows `· fast` from the first turn.
- Given you type `@` and part of a path in the box, when the list of the project's files narrows to it, then Tab or Enter puts the picked file in as an @ mention.
- Given you send a message over 12 lines, when it is drawn in the thread, then it shows its first 6 lines and a "… N more lines" row that a click or the unfold key opens, and Claude gets the whole text.
- Given a folded message carries an image or names a PDF, when it is drawn folded, then its images and PDF tiles still show below the fold.
- Given main ran `pane run`, when its output or a reply names `dashboard://pane/<slot>:<index>`, then it is drawn as a `pane <id>` link; a click lands on that pane on its own project's page, and on a pane no longer open says so and goes nowhere. Pane numbers are reused, so a link to a pane closed and opened again lands on whatever holds that number now.
- Given main has workers open, when the foot is drawn, then between what Claude is doing and the meters it counts them, `3 workers: 2 working, 1 done`; a click on it or Alt+W opens a list of them (the manager's across every project) that updates while open, the arrows walk it, Enter lands on the pane and Escape closes it.
- Given a worker main dispatched finishes its turn, when the hook reports it, then the conversation gets a prompt naming the worker and its pane link, queued behind the turn if one is running (workers-decision-1).
- Given a turn has ended with a suggested next prompt, when the box is empty, then it shows grey there and Tab fills the box with it; with the slash list open, Tab still fills the picked command.
- Given one Edit changes two lines far apart, when its diff is drawn, then each change shows with one unchanged line either side and a "…" line for what is skipped between them.
- Given a MultiEdit makes two edits, when its diff is drawn, then a dimmed "…" row sits between them, the same row that stands for skipped lines inside one edit.
- Given Claude puts up a TodoWrite list, when its call is drawn, then the line says how many items are done and unfolds to a checklist: done items struck through, the one under way in bold by its "-ing" wording.
- Given an Edit whose old and new text are the same, when it is drawn, then its input shows instead of an empty diff.
- Given the project has earlier conversations, when you press Ctrl+R, then a search lists every prompt sent in the 20 most recent (`HISTORY_CONVERSATIONS`), newest first, this conversation's from the screen and the others read off disk only once they change, and the one picked goes in the box.
- Given Claude has started a subagent, when you unfold its Agent call, then the subagent's own text and tool calls are listed under the call, a skill it loaded as one line and its prompt not repeated, a subagent of its own indented under its line; a conversation read back after a restart has none.
- Given Claude has edited files in the conversation, when you send `/diff`, then a sheet lists each file it changed, in the order first touched, with each edit's change in turn under a heading counting the lines in and out across them; a failed or refused edit is not in it. A code-only `/rewind` keeps the conversation, so the edits it put back are still listed.
- Given Claude edited files after a prompt, when you /rewind to it and restore code, then the files are as they were before it; restore conversation, and the conversation picks up from just before it with the prompt back in the box.
- Given text in the box, when you press Ctrl+G, then it opens in the project's nvim, and once saved there and you come back, the box holds what you saved.
- Given Claude thinks before it answers, when the block arrives, then it is a folded Thinking line that unfolds to the summary.
- Given a request fails and the session retries it, or a plan limit nears or is hit, when the session says so, then a notice line in the thread says the error and the wait, or which limit and when it resets; the same limit line shows once.
- Given Claude has a task running, when you pick its row in the strip with Alt+T and press Alt+X, then the session stops it; Alt+B sends it to the background instead, and with no row picked Alt+B backgrounds every foreground task.
- Given a half-written prompt in the box, when you press Alt+S, then the box empties and Up from the empty box brings the draft back before any sent prompt; the last 10 stashed are kept until they are sent.
- Given Up showing an earlier prompt over a half-written draft, when you press Alt+S, then the draft is stashed, not the prompt Up showed; a waiting question keeps the keyboard.
- Given a message you sent or Claude wrote, when it is drawn, then a grey line above it gives the time it was written, with the date on the first message of each day (judged against the message above, so it never changes while the pane stays open), and for Claude's the model that wrote it; Claude Code's own notices (`<synthetic>`) get the time alone.
- Given Claude has replied, when you send `/copy`, then the reply's markdown, all Claude wrote since the turn began (a prompt, or a message such as a background task finishing that starts a turn of its own) with its tool calls left out, is on the clipboard; `/copy 2` takes the reply before it, and a count past the first reply is refused.
- Given an MCP server failed to connect, when you type /mcp and pick it, then Reconnect tries it again and Disable turns it off; a disabled one offers only Enable.
- Given a conversation is on the screen, when you send `/rename Board drag fix`, then it is renamed and `/resume` lists it by that name; with no name or no conversation yet, it is refused.
- Given a turn is running, when you send `/btw` and a question, then a sheet answers it from the conversation so far, without tools, and the question and answer never join the conversation.
- Given you pressed Ctrl+W twice in the box, when you press Ctrl+Y, then both words come back as one; Alt+Y straight after swaps them for the kill before, and Ctrl+U and Ctrl+K kill to the line's start and end the same way.
- Given a hook runs during a turn, when it starts, then the working line says `Running PreToolUse:Bash hook…` until it answers; a hook that fails leaves a folded `PreToolUse:Bash hook failed (exit 2)` line that unfolds to what it printed as terminal text (not markdown), and one that succeeds leaves nothing. A SessionStart hook failing before a resumed conversation is read back goes under that conversation, not in place of it.
- Given a conversation on the screen, when you send `/export` and pick Copy to clipboard, then its text is on the clipboard, prompts behind `>` and each tool call one line; Save to file writes it to a dated `.txt` in the project's folder, and `/export notes` writes `notes.txt` there; a name outside the folder or already taken is refused and nothing is written.
