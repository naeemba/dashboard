# Chat

The Claude screen: the project's main session, an Agent SDK `query()` kept
open per project and drawn as HTML over a prompt box. It asks for tool
permissions itself, runs slash commands, and shows images, PDFs and the agents
Claude has running.

## Files

- Main's half: `chat-sessions.ts`, `chat-commands.ts`, `chat-permission.ts`,
  `chat-transcript.ts`, `chat-pdf.ts`
- What is drawn: `chat-view.ts`, `chat-entries.ts`, `chat-markdown.ts`,
  `chat-tools.ts`, `chat-events.ts`, `chat-tags.ts`, `chat-reveal.ts`
- Around the box: `chat-ask-view.ts`, `chat-menu-view.ts`, `chat-foot-view.ts`,
  `chat-status.ts`, `chat-history.ts`, `chat-tasks.ts`, `chat-task-strip.ts`,
  `chat-queue.ts`, `chat-queue-view.ts`
- Styles: `chat.css`

## Scenarios

- Given a tool needs a yes, when the session asks, then a box over the prompt holds the question until you answer it.
- Given a turn is running, when you press Escape, then the turn is interrupted and any pending question declined.
- Given the app restarts, when you send the next prompt, then the project's conversation is resumed from `chat-sessions.json`.
- Given you type `/model` with a name the session does not offer, when you send it, then it is refused and not saved.
- Given Claude is working, when you send a message, then it waits grey under the conversation until the session takes it, and Up in the empty box takes it back.
- Given a message names a PDF, when it is drawn, then it is a tile that opens in the built-in viewer.
