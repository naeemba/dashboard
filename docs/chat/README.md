# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, rewinds to an earlier prompt, and shows images, PDFs and the agents
Claude has running.

## Files

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-events.ts`, `chat-fold.ts`, `chat-tags.ts`, `chat-reveal.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`,
  `chat-mentions.ts`, `chat-rewind.ts`, `chat-rewind-view.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question declined.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given you type `/model` with a name the session does not offer, when you send it, then it is refused and not saved.
- Given a message names a PDF, when it is drawn, then it is a tile that opens in the built-in viewer.
- Given you type `/effort high`, when you send it, then the next turn runs at high and the foot says `high effort`; `ultrathink` in a prompt shows in the foot while its turn runs.
- Given you type `@` and part of a path in the box, when the list of the project's files narrows to it, then Tab or Enter puts the picked file in as an @ mention.
- Given you send a message over 12 lines, when it is drawn in the thread, then it shows its first 6 lines and a "… N more lines" row that a click or the unfold key opens, and Claude gets the whole text.
- Given a folded message carries an image or names a PDF, when it is drawn folded, then its images and PDF tiles still show below the fold.
- Given a turn has ended with a suggested next prompt, when the box is empty, then it shows grey there and Tab fills the box with it; with the slash list open, Tab still fills the picked command.
- Given Claude edited files after a prompt, when you /rewind to it and restore code, then the files are as they were before it; restore conversation, and the conversation picks up from just before it with the prompt back in the box.
- Given Claude thinks before it answers, when the block arrives, then it is a folded Thinking line that unfolds to the summary.
- Given Claude has a task running, when you pick its row in the strip with Alt+T and press Alt+X, then the session stops it; Alt+B sends it to the background instead, and with no row picked Alt+B backgrounds every foreground task.
