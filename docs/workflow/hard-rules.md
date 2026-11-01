# Workflow: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## workflow-rule-1: Never rebuild or restart the running app

**Do not quit, kill, restart, or replace the Dashboard app running on this
machine unless I ask for it in that same conversation.** No `npm run package`
into /Applications, no `osascript ... quit`, no `pkill`, no `open -a Dashboard`.

Restarting kills every shell inside it, including long-running tasks, with no
way to get the work back. The quit also fires node-pty's exit callback during
teardown, so it surfaces as a SIGABRT crash report and looks like the app broke.

After changing code: run the tests, say the installed app needs a rebuild and
restart to pick the change up, and stop there. Building into `out/` or `.vite/`
is fine — nothing runs from those.

## workflow-rule-2: A decision gets its own module and a test

`renderer.ts` is wiring: read the browser, call a function, draw the answer. A
rule with branches in it — *window focused? is this the pane I am in? do I
notify?* — goes in a small module beside a `.test.ts`, the way `session.ts`,
`board-state.ts`, `terminals.ts`, `shell.ts` and `waiting.ts` do.

Left inline, nothing pins it. Someone swaps `document.hasFocus()` for a window
flag, every test passes, and a bell from the pane you are staring at starts
turning your own project yellow.

The main process's event wiring and its spawning are exempt — wherever they
live, not `main.ts` the file. `askingToQuit` has no branch of its own; what
could break is Electron's plumbing, and a test of that is a test of mocks.

The exemption travels with the code, not the filename. `task-runner.ts` sits
outside `main.ts` and is still exempt: it spawns a process and hands the lines
on. But a decision that moves out alongside the wiring is not — which report to
send when a process ends is `finishedTasks` in `tasks.ts`, tested. `review-flow.ts`
takes the same ports shape and is not exempt for taking it: the order a ship's
second half happens in is a decision, and `review-flow.test.ts` pins it.

Wiring is exempt wherever it sits; a branch owes a test wherever it sits.

## workflow-rule-3: A card does not bump the version

The manager's foot line, the log's `started` line and the remote host's
handshake all show `<package.json version>+<short commit>`, stamped at build
time by `vite.build-version.ts`. The commit is what tells an installed copy
from main: the same commit and it has everything merged up to that point (the
stamp is HEAD, so a build from a dirty tree says so nowhere). The remote host
refuses a screen whose stamp differs, so both ends must be the same build.

Every card used to bump `package.json` itself. With cards running in parallel
that cost 13 `package.json` and 12 lockfile conflicts in one review window, and
two cards that started on the same number still landed on the same number, so
it told nothing apart anyway. Leave `version` alone in a card's pull request;
move it only when cutting a release.
