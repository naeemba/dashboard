# Errors

What happens to a failure: a refusal says why where it is decided, a failure
nobody caught goes on the status bar and the app keeps running, and a failure
before the first window gets a box and an exit.

## Files

Folders: `src/shared/errors/`, `src/renderer/errors/`.

- `failure.ts`, `status-error.ts`, `error-log.ts`, `status-message.ts`
- The `String(error)` lint (errors-rule-1): `eslint.config.mjs`, `eslint.config.test.ts`

## On screen

The status bar's message goes by itself: a notice after 8 seconds, an error
after 20, longer for a sentence that takes longer to read. A click on it, or a
bare Escape anywhere, clears it sooner; the Escape still reaches the pane or
dialog it was pressed in. Every notice is logged as info and every error as
error, with the owner that wrote it as the entry's action, each sentence once,
and again only after it has been quiet for a minute. An error while the window
is not in front also raises a desktop notification, by the same rule; a click
on it brings the window forward. The settings screen's Errors row turns those
banners off (`errors.notify`). The update lines (`Dashboard vX.Y.Z is out` and
`Dashboard vX.Y.Z is ready · … to restart into it`) do not fade; a click or
Escape still clears them.

## Scenarios

- Given the app is open, when a timer's promise rejects and nothing handles it, then the message goes on the status bar and every shell keeps running.
- Given `worktrees.json` cannot be read at launch, when the app starts, then a box names the file and the app exits without writing the record.
- Given a `.env` that will not load, when the app starts, then it opens without those settings and the bar names the file.
- Given a failure repeats on a timer, when it is logged, then the same sentence is not written to the log every few seconds.
- Given a renderer failure goes on the bar, when it is logged, then the entry carries the Error's stack and cause chain (errors-decision-4).
- Given an IPC handler throws, when the call fails, then main logs the channel, the action it was the door to, and main's stack.
- Given a refusal on the bar that nobody clears, when 8 seconds pass, then the bar is empty and the log holds the refusal as an info line (errors-decision-5).
- Given a message on the bar, when you press Escape in a pane, then the bar clears and the pane still gets the Escape.
- Given the window is behind another, when an error goes on the bar, then a desktop notification says it, and the same sentence again within a minute raises none.
- Given the Errors row is off, when an error goes on the bar with the window behind, then no notification is raised.

## Open questions

- Main's own uncaught failures are logged by the renderer from the bar's
  sentence, without main's stack (errors-decision-4).
- The bar holds one line; a thing that fails on every tick writes over
  whatever was there, every tick (errors-decision-3).
- A progress notice (`shipping "Fix login"…`) fades after 8 seconds even when
  the work is still going (errors-decision-5).
