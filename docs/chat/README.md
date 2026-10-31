# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, rewinds to an earlier prompt, and shows images, PDFs and the agents
Claude has running.

## Files

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`, `chat-notices.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-diff.ts`, `chat-events.ts`, `chat-fold.ts`, `chat-tags.ts`, `chat-reveal.ts`,
  `chat-stamp.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`,
  `chat-mentions.ts`, `chat-rewind.ts`, `chat-rewind-view.ts`, `chat-screen-commands.ts`,
  `chat-mcp.ts`, `chat-mcp-view.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question declined.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given a conversation is under way, when you send `/branch`, then the page carries on in a copy of it and the original stays in `/resume`.
- Given you type `/model` with a name the session does not offer, when you send it, then it is refused and not saved.
- Given a message names a PDF, when it is drawn, then it is a tile that opens in the built-in viewer.
- Given you type `/effort high`, when you send it, then the next turn runs at high and the foot says `high effort`; `ultrathink` in a prompt shows in the foot while its turn runs.
- Given you type `@` and part of a path in the box, when the list of the project's files narrows to it, then Tab or Enter puts the picked file in as an @ mention.
- Given you send a message over 12 lines, when it is drawn in the thread, then it shows its first 6 lines and a "… N more lines" row that a click or the unfold key opens, and Claude gets the whole text.
- Given a folded message carries an image or names a PDF, when it is drawn folded, then its images and PDF tiles still show below the fold.
- Given a turn has ended with a suggested next prompt, when the box is empty, then it shows grey there and Tab fills the box with it; with the slash list open, Tab still fills the picked command.
- Given one Edit changes two lines far apart, when its diff is drawn, then each change shows with one unchanged line either side and a "…" line for what is skipped between them.
- Given a MultiEdit makes two edits, when its diff is drawn, then a dimmed "…" row sits between them, the same row that stands for skipped lines inside one edit.
- Given an Edit whose old and new text are the same, when it is drawn, then its input shows instead of an empty diff.
- Given the project has earlier conversations, when you press Ctrl+R, then a search lists every prompt sent in the 20 most recent (`HISTORY_CONVERSATIONS`), newest first, this conversation's from the screen and the others read off disk only once they change, and the one picked goes in the box.
- Given Claude has started a subagent, when you unfold its Agent call, then the subagent's own text and tool calls are listed under the call, a skill it loaded as one line and its prompt not repeated, a subagent of its own indented under its line; a conversation read back after a restart has none.
- Given Claude has edited files in the conversation, when you send `/diff`, then a sheet lists each file it changed, in the order first touched, with each edit's change in turn under a heading counting the lines in and out across them; a failed or refused edit is not in it. A code-only `/rewind` keeps the conversation, so the edits it put back are still listed.
- Given Claude edited files after a prompt, when you /rewind to it and restore code, then the files are as they were before it; restore conversation, and the conversation picks up from just before it with the prompt back in the box.
- Given Claude thinks before it answers, when the block arrives, then it is a folded Thinking line that unfolds to the summary.
- Given a request fails and the session retries it, or a plan limit nears or is hit, when the session says so, then a notice line in the thread says the error and the wait, or which limit and when it resets; the same limit line shows once.
- Given Claude has a task running, when you pick its row in the strip with Alt+T and press Alt+X, then the session stops it; Alt+B sends it to the background instead, and with no row picked Alt+B backgrounds every foreground task.
- Given a message you sent or Claude wrote, when it is drawn, then a grey line above it gives the time it was written, with the date on the first message of each day (judged against the message above, so it never changes while the pane stays open), and for Claude's the model that wrote it; Claude Code's own notices (`<synthetic>`) get the time alone.
- Given an MCP server failed to connect, when you type /mcp and pick it, then Reconnect tries it again and Disable turns it off; a disabled one offers only Enable.
