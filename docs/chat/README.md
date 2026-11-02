# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, rewinds to an earlier prompt, and shows images, PDFs and the agents
Claude has running.

## Files

Folders: `src/main/chat/`, `src/shared/chat/`, `src/renderer/chat/`.

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`, `chat-elicitation.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`, `chat-notices.ts`, `chat-export-target.ts`,
  `chat-start.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-diff.ts`, `chat-events.ts`, `chat-fold.ts`, `chat-tags.ts`, `chat-reveal.ts`,
  `chat-stamp.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`,
  `chat-mentions.ts`, `chat-rewind.ts`, `chat-rewind-view.ts`, `chat-screen-commands.ts`,
  `chat-screen-dispatch.ts`, `chat-attachments.ts`,
  `chat-line-editing.ts`,
  `chat-mcp.ts`, `chat-mcp-view.ts`, `chat-rename.ts`, `chat-queue.ts`, `chat-queue-view.ts`, `chat-btw-view.ts`,
  `chat-hooks.ts`, `chat-export.ts`, `chat-export-view.ts`, `chat-workers-view.ts`, `chat-pane-links.ts`,
  `chat-context.ts`, `chat-context-view.ts`; the popup it opens is `src/renderer/app/anchored-popup.ts`
  with `popup-placement.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given an MCP server asks for a form or a sign-in link, when the session passes it on, then the same box walks the form a field at a time, or opens the link, and every step can decline; a yes or no or a pick opens on the server's default, a typed answer outside the field's bounds keeps the box open saying what it takes, a required multi-select or a link that is not http(s) can only be declined, an optional multi-select can also be skipped, and Escape or the session ending reaches the server as a cancel, not a decline; the server's other dialogs are not declared, so Claude Code keeps its own fallback.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question is given up on: a tool call is declined, a server form cancelled.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given the app launches with five projects, when you have shown none of their Claude screens, then no project runs a `claude` CLI; showing one starts that page's session and its status line fills in, and a page one of main's workers came back on starts at launch so the worker's report has somewhere to arrive.
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
- Given a turn has been measured, when you click the context meter, press Alt+U or send `/context`, then a popup opens just above the meter, lined up with its right edge, listing each part of the window (system prompt, tools, memory files, skills, messages, free space and the rest) with its tokens, share and a bar in its colour, then the memory files and the MCP tools biggest first, five each and an `N more` row; deferred tool schemas are left out. Its heading says when the numbers were measured, it follows a new measure while open, the arrows walk its rows and Escape puts the keyboard back in the box (chat-decision-10). Before any measure it says so instead of opening.
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
