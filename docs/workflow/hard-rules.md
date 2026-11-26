# Workflow: hard rules

The one-line rule is in `CLAUDE.md`, or the entry names the check that holds it; this is what
breaking it looked like.

## workflow-rule-1: Never rebuild or restart the running app

**Do not quit, kill, restart, or replace the Dashboard app running on this
machine unless I ask for it in that same conversation.** No `pnpm run package`
into /Applications, no `osascript ... quit`, no `pkill`, no `open -a Dashboard`.

Restarting stops every Claude screen mid-turn. The worker panes' shells now
outlive it in the pane host (panes-decision-1), but only when a host is
running: without one, a restart kills every shell, long-running tasks
included, with no way to get the work back. The quit also fires node-pty's exit callback during
teardown, so it surfaces as a SIGABRT crash report and looks like the app broke.

After changing code: run the tests, say the installed app needs a rebuild and
restart to pick the change up, and stop there. Building into `out/` or `.vite/`
is fine — nothing runs from those.

A PreToolUse hook refuses the quit, the kill, `open -a Dashboard` and a hand
replacement of the installed build (workflow-decision-7). The rule stays here
for what the hook cannot read: a script of your own that does the same.

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
handshake all show `<package.json version>+<12-digit commit>`, stamped at build
time by `vite.build-version.ts`. The commit is what tells an installed copy
from main: the same commit and it has everything merged up to that point (the
stamp is HEAD, so a build from a dirty tree says so nowhere). The remote host
refuses a screen whose stamp differs, so both ends must be the same build.

Every card used to bump `package.json` itself. With cards running in parallel
that cost 13 `package.json` and 12 lockfile conflicts in one review window, and
two cards that started on the same number still landed on the same number, so
it told nothing apart anyway. Leave `version` alone in a card's pull request;
move it only when cutting a release.

CI enforces it: on a pull request, `scripts/version-unchanged.mjs` compares the
merge commit's `version` with its base's and fails the run when they differ,
naming both. A branch behind a release passes, since its merge takes the base's
number. Release's own commit goes straight to main, where the step is skipped.

## workflow-rule-4: A test's folder comes from temporaryFolder()

A test that needs a folder takes it from `temporaryFolder(prefix)` in
`src/main/testing/temporary-folder.ts`, which removes it after the test file
even when an `expect` fails first. Tests that called `mkdtempSync` themselves
and never removed what they made left about 200 folders in `/tmp` per run; on
2026-11-08, with five workers running the suite, they filled its 16G and
stopped every worker. `pnpm exec eslint .` refuses `mkdtemp` and `mkdtempSync`
imported into a `*.test.ts` or `*-fixture.ts` under `src/`, and
`eslint.config.test.ts` pins it.

## workflow-rule-5: A commit runs eslint, the typecheck and the markdown checks first

`.githooks/pre-commit` runs eslint on the staged `.ts`/`.js` files, `tsc --noEmit` on the whole
project and the markdown checks on the staged markdown (the width, workflow-decision-11, and the
docs ids, `scripts/docs-ids.mjs`), and refuses the commit
on any failure. `pnpm install` points `core.hooksPath` at
`.githooks` (the `prepare` script), so every worktree of the checkout gets it. Before it,
`tsc --noEmit` ran only in CI and a worker found "'wholePath' is defined but never used" mid-edit, a
round trip after it had committed.

eslint runs only when code is staged, and on the whole project (`eslint .`) when `eslint.config.*`,
`package.json` or `pnpm-lock.yaml` is: a new rule otherwise passed on the config file alone and
refused the files it targets only in CI. tsc also runs when `tsconfig*.json`, `package.json` or
`pnpm-lock.yaml` is, since those change what it reports. Both skip a commit that only touches
`.dashboard/` or docs: the app and the board command commit cards from throwaway worktrees with no
`node_modules`, and a card must never wait on, or fail on, tsc. A commit that stages code in a
checkout with no `node_modules` is refused and told to run `pnpm install`: it used to go through
unchecked, and that is how a broken merge from a fresh worktree reached #196. `filesToCheck`,
`runsTypecheck` and `missingToolsRefusal` in `scripts/pre-commit.mjs` decide, tested beside it;
`scripts/pre-commit-step.mjs` runs the tools with node, and `.gitattributes` pins the hook to LF, so
the same hook works on Windows (a CRLF shebang refuses every commit). It reads the working tree, not
the index: a half-staged file is checked as it stands on disk. `git commit --no-verify` gets past
it; CI runs both anyway.

## workflow-rule-6: A test that touches paths or processes passes on Windows

Windows has been a target since #191, and `windows-latest` runs the tests on every pull request.
#288 and #289 built expected paths with `/` and reached that job only after their review loop had
finished, so the fix was another round. A test that names a path builds it with `path.join`; one
that needs POSIX paths, file modes, unix sockets or signals skips on `win32` with a named
`it.skipIf` saying why, imported from `src/main/testing/windows-skips.ts` rather than copied per
file: `posixPathsOnly` for POSIX path literals (#370's review loop added such a test without it, and
it failed Windows CI), `posixModesOnly` for file modes, `posixCommandsOnly` for a shell script or
POSIX command, `halfOpenSocketsOnly` for a socket read after its half-close, and a new export there
for the rest; never a bare `it.skipIf` with its reason in a comment (#375 named nine). A `describe`
whose every test shares the reason takes a suite-level skip from the same file:
`posixCommandsSuite`, `socketFilesSuite` for a stale socket file to claim, `screenHostSuite` where
there is no screen host; never a bare `describe.skipIf` (#389 named five). CI's Windows
job holds it, after review. No lint or test holds it earlier: 24 of the 40 test files with a
`/tmp/`-style literal have no `win32` guard and pass on Windows, since they use the path as a string
and never touch the disk, so a check on the literal would flag mostly correct tests. Card 43ceddd8
(make the POSIX path-literal tests portable instead of skipping them) is the way to a check that
holds.

## workflow-rule-7: A pull request leaves the board's files alone

Every board write lands on main by itself (board-decision-5), from the screen or the `board`
command, from the checkout or a worktree. A card file in a branch is a copy from the day it was
written there: merged, it puts the card back to that day's column and drops what main has had since.
Card files leaked into 12+ pull request diffs over 30 sessions; the 60 merged ones up to #279 each
carried their own card, from when a worker moved it in its branch.

CI enforces it: on a pull request, `scripts/board-unchanged.mjs` lists the files the merge commit
changes against its base and fails the run when any is under `.dashboard/board/` or is the old
`board.json` (still read, so a stale copy brings back deleted cards), naming them and giving the
`git restore` from the merge-base that leaves the branch with no board change. Restoring from
`origin/main` instead leaves a copy of main's board as of the fetch, which conflicts the next time
main moves one of those cards. `git log` shows no pull request that needed one; the seeded
`.dashboard/CLAUDE.md` and `README.md` are changed by pull requests on purpose (#317) and sit
outside the folder, so nothing is exempt.
