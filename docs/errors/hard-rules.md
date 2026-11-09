# Errors: hard rules

The one-line rule is in `CLAUDE.md`, or the entry names the check that holds it; this is what breaking it looked like.

## errors-rule-1: A refusal is explained where it is decided

When one place decides to refuse something and another prints the message, the
two drift. Export the predicate from the file that enforces the refusal and call
it from the file that displays it.

What drift looks like: someone changes `commitTitle` to refuse only while a
subtask is unfinished. You blank the title of a card whose subtasks are all
Done. The card is deleted — and the status bar says `"Ship it" has subtasks —
delete it with d`. You read that, assume the card survived, and it is gone. No
test fails.

The predicates live in `board.ts`, `settings.ts`, `ship.ts`, `pane-reading.ts`,
`notes-state.ts` and `board-state.ts`. A refusal worth a message reuses one or
adds another — never a second copy of the condition. This lists them:

    grep -rhn "^export function \(has\|is\|may\|blocking\|changed\)[A-Za-z]*(" src/shared/board/board.ts src/shared/settings/settings.ts src/main/ship/ship.ts src/shared/panes/pane-reading.ts src/renderer/notes/notes-state.ts src/renderer/board/board-state.ts

A predicate is only worth anything if it asks the same question as the thing
doing the refusing. `blockingChanges` skips `.dashboard/` on purpose, so a ship
does not refuse itself over the Ship move that started it. Ask it before `git
worktree remove` and it answers "nothing in the way" about a worktree git is
about to refuse: the app's own message never prints and a raw `fatal: ...
contains modified or untracked files` lands on the card instead. `changedFiles`
is the same list without the exemption, and that is the one the worktree list
and the review ask.

The prose counts too. A comment that restates a rule living in another file is a
second copy no test can catch — the code stays right while the sentence goes
stale. Say what the wiring does; let the module say what the rule is.

An error put in front of a person goes through `failureText`, never
`String(error)`: that prints `Error: boom` with the prefix, an empty or
`undefined` message where `failureText` says `no reason given`, and the read
never reaches `whenFailureRead`, so the bar's log line loses the Error and its
stack (errors-decision-4). `pnpm exec eslint .` refuses `String(error)` and
`${error}` everywhere in `src/` but the two files that format errors
themselves: `failure.ts`, and `src/main/command/failure-line.ts`, the command
line's own formatter, which prints a stack on purpose. `eslint.config.test.ts`
pins it. The lint is a name match: it catches a value named `error` or
`thrown`, nothing else, so a clean lint is not proof the rule held. Never an `eslint-disable` for it; a message that needs something
`failureText` does not give is a change to `failureText`.

## errors-rule-2: An IPC handler answers a refusal, it does not throw it

A handler that throws makes `ipcMain.handle` reject the renderer's `invoke`
with Electron's wrapper in front of the message. `projects:open` used to refuse
another screen's folder dialog that way, and that screen read `Error invoking
remote method 'projects:open': Error: Type the folder's path on the host`
instead of the sentence. It now answers `{ refused }`, the shape `pdf:read`
already used, and the view prints the text as it is.

Throwing stays right for a failure: `readBoard` on a broken file throws, and
the status bar says something broke (errors-decision-2).
