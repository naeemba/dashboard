# Workflow

How a change is made and shipped here: never touch the running app, a decision gets a module and a
test, and the build stamps its commit instead of every card bumping the version. Owns
`.gitattributes`, the CI and release workflows (the release notes and download links in
`scripts/release-notes.mjs`, tested beside it), `scripts/release.sh` (its decisions in
`scripts/release-checks.mjs`, tested beside it), the pre-commit hook (`.githooks/pre-commit`, turned
on by the `prepare` script; its decision in `scripts/pre-commit.mjs`, tested beside it, run by
`scripts/pre-commit-step.mjs`; workflow-rule-5), `scripts/version-unchanged.mjs`, CI's refusal of a
pull request that moves the version (tested beside it; `scripts/version-unchanged-step.mjs` is its
entry), `scripts/board-unchanged.mjs`, CI's refusal of a pull request that changes the board's files
(tested beside it; `scripts/board-unchanged-step.mjs` is its entry; workflow-rule-7) and the
`/release` command (`.claude/commands/`, beside `/rebuild`), the pnpm setup and the build hooks, the
test run's temporary-folder guard and its eslint rule (`vitest.config.ts`,
`vitest.temporary-folder-guard.ts`, tested beside it, its count in
`vitest.temporary-folder-leftovers.ts`, tested beside it, and
`src/main/testing/temporary-folder.ts`), `src/main/testing/source-files.ts` (every non-test `.ts`
file under a folder, for the tests that read the source), the running-app guard
(`src/main/workflow/running-app-guard.ts`, tested beside it, run by `board guard`;
workflow-decision-7), the package-manager guard (`src/main/workflow/package-manager-guard.ts`,
tested beside it, run by `board guard`; workflow-decision-9), the worktree guard
(`src/main/workflow/worktree-guard.ts`, tested beside it, run by `board guard`;
workflow-decision-10), the test-run guard (`src/main/workflow/test-run-guard.ts`, tested beside it,
run by `board guard`; workflow-decision-12), `scripts/node-pty-built.mjs` and
`scripts/no-running-app.mjs` (its rule in `scripts/running-app.mjs`, tested beside it), written in
Node so the same hook runs on a mac, Linux and Windows; `pnpm check` (its summary in
`scripts/check.mjs`, tested beside it, run by `scripts/check-step.mjs`) and the markdown width half
of `pnpm lint` (`scripts/markdown-width.mjs`, tested beside it, run by
`scripts/markdown-width-step.mjs`; workflow-decision-11); `CLAUDE.md` carries each rule a check does
not hold in one line and points at its id here (workflow-decision-8).

`claude-md-audit.md` is the 2026-11-09 audit of every CLAUDE.md rule, global and this repo's: which
stay, which a tool or hook should carry, and the cards that moved them.

## Checks

The three in `CLAUDE.md`, or all three at once with `pnpm check`. It runs `pnpm test`,
`pnpm typecheck` and `pnpm lint` in turn, writes everything they print to `check.log` at the
checkout's top (ignored as `*.log`), and prints one line each and the log's path:

    test       pass  3565 passed | 1 skipped (3566)
    typecheck  pass  0 errors
    lint       FAIL  3 problems
    Full output: /…/dashboard/check.log

It exits non-zero when one failed, and the reason is in the log: there is no need to run a check
again to see the end of it. A check that died before counting anything (a missing module, a broken
config) says `no test count`, `no error count` or `no problem count` instead of a count of 0, and
an eslint that died while the markdown check counted lines says `no eslint count, 3 markdown
problems`.

`pnpm lint` (`scripts/lint-step.mjs`) is eslint and, even when eslint fails, a line-width check of
every tracked markdown file but `CHANGELOG.md` and `.dashboard/`: no line over 100 characters, apart
from code blocks, headings, table rows, front matter and lines holding a URL
(workflow-decision-11). The pre-commit hook runs the same check on the staged
markdown. A file wraps at 80 or at 100; rewrap to the width around the change.

`pnpm test` runs in a temporary folder of its own: the guard points
`TMPDIR` (`TEMP` and `TMP` on Windows) at a fresh `vitest-…` folder before any test file starts, so
every `os.tmpdir()` (a test's, the code under test's, a git or node it spawns) lands inside it. When
the run ends it removes that folder, and fails the run naming what was left in it by the name it was
made with, `dashboard-review- ×62`. A test that needs a folder takes it from
`temporaryFolder(prefix)` in `src/main/testing/temporary-folder.ts`, which removes it after the test
file (workflow-rule-4). A leftover the code under test made is that code's bug, not the test's: it
would stay in a user's `/tmp` too, so fix the code rather than wrapping it. Node's own compile
caches are not counted. Before the guard, a test run left about 200 folders in `/tmp`, and on
2026-11-08 they filled its 16G and stopped every worker.

## How to release

    scripts/release.sh minor        # or major, or patch; /release minor in Claude Code runs the same

Run it on main, clean and equal to `origin/main`; it refuses otherwise and says which. It waits
while CI is still running on that commit, and stops as soon as a run has failed. It dispatches
Release with the bump, watches the run, and once the release is published stops if an app is running
out of this checkout (`scripts/no-running-app.mjs`, before anything there is rewritten), then pulls
main, runs `pnpm install --frozen-lockfile`, the three checks and `scripts/rebuild.sh`, which stops
unless the installed `app.asar` carries the new `<version>+<commit>` stamp, and prints the version,
the release URL and "restart the app when ready". It never quits or restarts the running app. A
failed leg stops it with the leg's name and leaves the release a draft; re-run the failed jobs in
the Actions tab, then `scripts/release.sh --resume <run id>` watches that run and installs it; a
resume expects `origin/main` to be ahead by the release commit the run pushed and fast-forwards to
it. It polls the run rather than trusting `gh run watch`, retries every GitHub read, and every stop
prints `Stopped:` with what to run next (workflow-decision-6). Release → Run workflow in the Actions
tab still works by hand; the install afterwards is then yours.

The notes open with "What's new": the titles of the board cards (subtasks left out) that are in
`Done` now and were not at the last release tag, read from `.dashboard/board/cards/`. GitHub's pull
request list follows. The workflow writes them, so they are the same whichever way the run was
started (workflow-decision-5).

## Scenarios

- Given a code change is done, when the checks pass, then the installed app is left running and the
  change is reported as needing a rebuild.
- Given a rule with branches, when it is written, then it lives in its own module beside a
  `.test.ts`.
- Given a card's pull request, when it merges, then `package.json` `version` has not moved in it,
  and the build it makes shows the merged commit.
- Given a pull request whose diff against its base changes a file under `.dashboard/board/` or the
  old `.dashboard/board.json`, when CI runs, then it fails naming the files and giving the
  `git restore` from the merge-base that leaves the branch with no board change;
  `.dashboard/CLAUDE.md` and `README.md` go through.
- Given a fresh checkout on Windows, when `pnpm start`, `pnpm run package` or `pnpm run make` runs,
  then node-pty's prebuilt binary is copied into `build/Release`, nothing is compiled, and the
  package carries conpty and winpty beside `pty.node`.
- Given a pull request, when CI runs, then `windows-latest` installs, type-checks, runs the tests
  and makes the Squirrel installer without publishing it, and a test that needs POSIX paths, file
  modes, unix sockets or a half-open socket is skipped there with its reason beside it.
- Given `pnpm install` in a checkout, when a commit stages a `.ts` or `.js` file that eslint or tsc
  refuses, then the commit is refused with their errors; a commit staging only `.dashboard/` or docs
  goes through without running either, with or without `node_modules`.
- Given a checkout with no `node_modules`, when a commit stages code or the type or lint settings,
  then it is refused and says to run `pnpm install`.
- Given Release → Run workflow on main with a bump, when it runs, then `package.json` and a new
  `CHANGELOG.md` section (GitHub's generated notes since the last release) are committed to main and
  tagged `vX.Y.Z`, Linux, Windows and macOS (Apple silicon) each build and upload to a draft
  release, and the release is published with one download line per platform and a link to
  README.md's unsigned first-launch steps. Started from any other branch, it fails and says so.
- Given `scripts/release.sh <bump>` on a branch other than main, with uncommitted changes, behind or
  ahead of `origin/main`, or with no CI run on that commit or one that failed, when it runs, then it
  stops before dispatching and says which.
- Given `scripts/release.sh <bump>` while CI is still running on that commit, when it runs, then it
  says it is waiting, polls every 15 seconds until every run has finished, and dispatches only if
  all are green.
- Given `scripts/release.sh <bump>` whose run publishes, when it finishes, then main is
  fast-forwarded, the checks have passed, the installed `app.asar` carries `<version>+<commit>`, and
  the running app is still running.
- Given `scripts/release.sh <bump>` whose run publishes while an app runs out of this checkout, when
  it reaches the install, then it stops before fast-forwarding main or running `pnpm install`, the
  checkout is unchanged, and the last line names `--resume <run id>`.
- Given `scripts/release.sh --resume <run id>` on a run with a failed job, when it runs, then it
  names the failed jobs, installs nothing, and the release stays a draft.
- Given `scripts/release.sh --resume <run id>` on a clean main that `origin/main` is ahead of by the
  run's release commit, when it runs, then it watches the run and fast-forwards main to install it.
  With a commit `origin/main` lacks, or uncommitted changes, it stops and says which.
- Given a GitHub read fails with `failed to get run: ... EOF` while the run is still going, when
  `scripts/release.sh` is waiting on it, then it tries the read again and keeps waiting; a run that
  finishes green is installed.
- Given GitHub stays unreachable through four tries of a read, when `scripts/release.sh` needs it,
  then it stops with `Stopped:`, says the run may still be going and names the `--resume <run id>`
  to try.
- Given any step of `scripts/release.sh` fails, a check after the release is published included,
  when it exits, then the last line is `Stopped:` and says where things stand: nothing dispatched,
  the run may still be going (or the id is wrong), the run finished but reading its release failed,
  or the release is out and `--resume <run id>` finishes the install.
- Given cards that reached `Done` since the last release tag, when Release writes the notes, then a
  "What's new" list of their titles comes before GitHub's pull request list, in the release body and
  the `CHANGELOG.md` section alike.
- Given a build leg, when it checks out the tag, then it fetches the whole history and stops if the
  clone is shallow, so the changelog bundled from `git log` lists every merge.
- Given a build leg fails, when the publish job runs, then the release stays a draft and the run
  names the leg; re-running the failed jobs finishes it. A prepare job that failed after its push
  re-runs the same way, skipping the commit.
- Given a second Run workflow while one is running, when it starts after the first finishes, then it
  works out the version the first one released and fails before committing, saying to dispatch
  again.
- Given a pushed pre-release tag (`v2.42.0-rc.1`) on a commit whose `package.json` says that
  version, when the workflow runs, then it builds and publishes a pre-release the same way and
  commits nothing to main.
- Given a checkout installed before a dependency was added, when `scripts/rebuild.sh` runs, on any
  of the three platforms, then it runs `pnpm install --frozen-lockfile` before packaging and the
  build carries the new dependency. With a lockfile out of date it stops with pnpm's message and the
  installed build is untouched; with an app running out of the checkout it stops before installing.
- Given an app running out of this checkout, on any of the three platforms, when `pnpm run package`
  runs, then it stops before deleting the files that app is executing.
- Given an agent in any Claude session the board guard reaches, when it runs `pkill -f Dashboard`,
  `killall node` while the app's pane host runs, `kill` of the running app's pid or group,
  `osascript -e 'quit app "Dashboard"'`, `open -a Dashboard` or an `rm`/`cp` over
  `~/.local/opt/dashboard`, then the call is refused with a message saying to report that a rebuild
  is needed; `scripts/rebuild.sh`, `scripts/release.sh`, `rm -rf out .vite`, `pkill -f vitest` and a
  commit message naming any of these go through (`running-app-guard.test.ts`).
- Given an agent in any Claude session the board guard reaches, in a project whose lockfile is
  `pnpm-lock.yaml`, when it runs `npm install`, `npm ci` or `yarn add`, then the call is refused
  naming the lockfile and saying to install with pnpm; `pnpm install`, `npm test`, `bun test`,
  `npm version --no-git-tag-version`, `npx`, `npm i -g x`, `pnpm dlx x`, and a commit message naming
  `npm install` go through; in a monorepo package with its own lockfile, that one names the manager;
  outside a repository nothing is refused (`package-manager-guard.test.ts`).
- Given an agent in any Claude session the board guard reaches, when it runs `git worktree remove`
  of the folder it runs in (`.`, `"$PWD"`, its path, `cd .. && git worktree remove <name>`), or an
  Edit or Write of a file in another worktree of its repository, the main checkout included, then
  the call is refused saying why; removing another worktree, a file outside the repository and a
  commit message naming the command go through (`worktree-guard.test.ts`).
- Given an agent in any Claude session the board guard reaches, on Linux, when it runs `pnpm test`,
  `pnpm check`, `vitest`, `npm run test:unit`, `pytest` or `cargo test` while a test run is going
  in the same worktree, a subfolder of it included, then the call is refused naming the running
  one's pid and command line and saying to wait for it; a run while the only one going is in
  another worktree, `pnpm lint`, `pnpm add -D vitest` and a commit message naming `pnpm test` go
  through (`test-run-guard.test.ts`).
- Given a test that makes a temporary folder and never removes it, when `pnpm test` ends, then the
  run fails naming the folder's prefix and count, and nothing it made is left in `/tmp`.
- Given a clean `pnpm test`, when it ends, then `/tmp` holds the same `dashboard-*`, `create-task-*`
  and `board-files-*` folders it held before.
- Given two branches cut after #167 that each append a line to the same `docs/**/history.md`, when
  one merges the other, then both lines are kept and git reports no conflict. A branch cut
  before #167 still conflicts once, on the merge that brings `.gitattributes` in.
