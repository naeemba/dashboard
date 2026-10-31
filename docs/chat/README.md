# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, and shows images, PDFs and the agents
Claude has running.

## Files

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-events.ts`, `chat-fold.ts`, `chat-tags.ts`, `chat-reveal.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question declined.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given you type `/model` with a name the session does not offer, when you send it, then it is refused and not saved.
- Given a message names a PDF, when it is drawn, then it is a tile that opens in the built-in viewer.
- Given you send a message over 12 lines, when it is drawn in the thread, then it shows its first 6 lines and a "… N more lines" row that a click or the unfold key opens, and Claude gets the whole text.
- Given a folded message carries an image or names a PDF, when it is drawn folded, then its images and PDF tiles still show below the fold.
- Given a turn has ended with a suggested next prompt, when the box is empty, then it shows grey there and Tab fills the box with it; with the slash list open, Tab still fills the picked command.
- Given Claude has started a subagent, when you unfold its Agent call, then the subagent's own text and tool calls are listed under the call, a skill it loaded as one line and its prompt not repeated, a subagent of its own indented under its line; a conversation read back after a restart has none.
