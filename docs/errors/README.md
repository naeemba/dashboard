# Errors

What happens to a failure: a refusal says why where it is decided, a failure
nobody caught goes on the status bar and the app keeps running, and a failure
before the first window gets a box and an exit.

## Files

- `failure.ts`, `status-error.ts`, `error-log.ts`

## Scenarios

- Given the app is open, when a timer's promise rejects and nothing handles it, then the message goes on the status bar and every shell keeps running.
- Given `worktrees.json` cannot be read at launch, when the app starts, then a box names the file and the app exits without writing the record.
- Given a `.env` that will not load, when the app starts, then it opens without those settings and the bar names the file.
- Given a failure repeats on a timer, when it is logged, then the same sentence is not written to the log every few seconds.

## Open questions

- The bar holds one line; a thing that fails on every tick writes over
  whatever was there, every tick (errors-decision-3).
- `board-view.ts` and `notes-view.ts` still print `String(error)` and are
  exempted from the check until fixed (errors-rule-1).
