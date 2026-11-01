# Errors: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

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
`String(error)`. `board-cli.ts` is the exception — `failureLine` is the
command line's own formatter and prints a stack on purpose. `board-view.ts`
and `notes-view.ts` are owed the fix still, exempted below only so the check
stays actionable — a file added to the exemption list here without also being
fixed is the rule being broken, not followed. The check is that this prints
nothing:

    grep -rn "String(error)" src/ | grep -v 'failure.ts\|board-cli.ts\|board-view.ts\|notes-view.ts'

## errors-rule-2: An IPC handler answers a refusal, it does not throw it

A handler that throws makes `ipcMain.handle` reject the renderer's `invoke`
with Electron's wrapper in front of the message. `projects:open` used to refuse
another screen's folder dialog that way, and that screen read `Error invoking
remote method 'projects:open': Error: Type the folder's path on the host`
instead of the sentence. It now answers `{ refused }`, the shape `pdf:read`
already used, and the view prints the text as it is.

Throwing stays right for a failure: `readBoard` on a broken file throws, and
the status bar says something broke (errors-decision-2).
