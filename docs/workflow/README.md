# Workflow

How a change is made and shipped here: never touch the running app, a decision
gets a module and a test, and the build stamps its commit instead of every card
bumping the version. Owns `.gitattributes`, the CI and release workflows (the release notes and download links in
`scripts/release-notes.mjs`, tested beside it), `scripts/release.sh` (its decisions in `scripts/release-checks.mjs`, tested beside it) and the
`/release` command (`.claude/commands/`, beside `/rebuild`), the pnpm setup and the build
hooks, the test run's temporary-folder guard and its eslint rule (`vitest.config.ts`, `vitest.temporary-folder-guard.ts`, tested beside it, its count in
`vitest.temporary-folder-leftovers.ts`, tested beside it, and `src/main/testing/temporary-folder.ts`), `src/main/testing/source-files.ts` (every non-test `.ts` file under a folder, for the tests that read the source), `scripts/node-pty-built.mjs` and `scripts/no-running-app.mjs` (its rule
in `scripts/running-app.mjs`, tested beside it), written in Node so the same
hook runs on a mac, Linux and Windows; `CLAUDE.md` carries each rule in one
line and points at its id here.

`claude-md-audit.md` is the 2026-11-09 audit of every CLAUDE.md rule, global and this repo's: which stay,
which a tool or hook should carry, and the cards that move them.

## Checks

The three in `CLAUDE.md`. `pnpm test` runs in a temporary folder of its own: the guard points `TMPDIR`
(`TEMP` and `TMP` on Windows) at a fresh `vitest-…` folder before any test file starts, so every
`os.tmpdir()` (a test's, the code under test's, a git or node it spawns) lands inside it. When the run ends
it removes that folder, and fails the run naming what was left in it by the name it was made with,
`dashboard-review- ×62`. A test that needs a folder takes it from `temporaryFolder(prefix)` in
`src/main/testing/temporary-folder.ts`, which removes it after the test file (workflow-rule-4). A leftover the code under
test made is that code's bug, not the test's: it would stay in a user's `/tmp` too, so fix the code rather
than wrapping it. Node's own compile caches are not counted. Before the guard, a test run left about 200
folders in `/tmp`, and on 2026-11-08 they filled its 16G and stopped every worker.

## How to release

    scripts/release.sh minor        # or major, or patch; /release minor in Claude Code runs the same

Run it on main, clean and equal to `origin/main`, with CI green on that commit; it refuses otherwise and
says which. It dispatches Release with the bump, watches the run, and once the release is published pulls
main, runs `pnpm install --frozen-lockfile`, the three checks and `scripts/rebuild.sh`, which stops unless the
installed `app.asar` carries the new `<version>+<commit>` stamp, and prints the version, the release URL
and "restart the app when ready". It never quits or restarts the running app. A failed leg stops it with
the leg's name and leaves the release a draft; re-run the failed jobs in the Actions tab, then
`scripts/release.sh --resume <run id>` watches that run and installs it; a resume expects `origin/main` to be
ahead by the release commit the run pushed and fast-forwards to it. It polls the run rather than trusting
`gh run watch`, retries every GitHub read, and every stop prints `Stopped:` with what to run next (workflow-decision-6). Release → Run workflow in the
Actions tab still works by hand; the install afterwards is then yours.

The notes open with "What's new": the titles of the board cards (subtasks left out) that are in `Done`
now and were not at the last release tag, read from `.dashboard/board/cards/`. GitHub's pull request list
follows. The workflow writes them, so they are the same whichever way the run was started
(workflow-decision-5).

## Scenarios

- Given a code change is done, when the checks pass, then the installed app is left running and the change is reported as needing a rebuild.
- Given a rule with branches, when it is written, then it lives in its own module beside a `.test.ts`.
- Given a card's pull request, when it merges, then `package.json` `version` has not moved in it, and the build it makes shows the merged commit.
- Given a fresh checkout on Windows, when `pnpm start`, `pnpm run package` or `pnpm run make` runs, then node-pty's prebuilt binary is copied into `build/Release`, nothing is compiled, and the package carries conpty and winpty beside `pty.node`.
- Given a pull request, when CI runs, then `windows-latest` installs, type-checks, runs the tests and makes the Squirrel installer without publishing it, and a test that needs POSIX paths, file modes, unix sockets or a half-open socket is skipped there with its reason beside it.
- Given Release → Run workflow on main with a bump, when it runs, then `package.json` and a new `CHANGELOG.md` section (GitHub's generated notes since the last release) are committed to main and tagged `vX.Y.Z`, Linux, Windows and macOS (Apple silicon) each build and upload to a draft release, and the release is published with one download line per platform and a link to README.md's unsigned first-launch steps. Started from any other branch, it fails and says so.
- Given `scripts/release.sh <bump>` on a branch other than main, with uncommitted changes, behind or ahead of `origin/main`, or with CI not green on that commit, when it runs, then it stops before dispatching and says which.
- Given `scripts/release.sh <bump>` whose run publishes, when it finishes, then main is fast-forwarded, the checks have passed, the installed `app.asar` carries `<version>+<commit>`, and the running app is still running.
- Given `scripts/release.sh --resume <run id>` on a run with a failed job, when it runs, then it names the failed jobs, installs nothing, and the release stays a draft.
- Given `scripts/release.sh --resume <run id>` on a clean main that `origin/main` is ahead of by the run's release commit, when it runs, then it watches the run and fast-forwards main to install it. With a commit `origin/main` lacks, or uncommitted changes, it stops and says which.
- Given a GitHub read fails with `failed to get run: ... EOF` while the run is still going, when `scripts/release.sh` is waiting on it, then it tries the read again and keeps waiting; a run that finishes green is installed.
- Given GitHub stays unreachable through four tries of a read, when `scripts/release.sh` needs it, then it stops with `Stopped:`, says the run may still be going and names the `--resume <run id>` to try.
- Given any step of `scripts/release.sh` fails, a check after the release is published included, when it exits, then the last line is `Stopped:` and says where things stand: nothing dispatched, the run may still be going (or the id is wrong), the run finished but reading its release failed, or the release is out and `--resume <run id>` finishes the install.
- Given cards that reached `Done` since the last release tag, when Release writes the notes, then a "What's new" list of their titles comes before GitHub's pull request list, in the release body and the `CHANGELOG.md` section alike.
- Given a build leg, when it checks out the tag, then it fetches the whole history and stops if the clone is shallow, so the changelog bundled from `git log` lists every merge.
- Given a build leg fails, when the publish job runs, then the release stays a draft and the run names the leg; re-running the failed jobs finishes it. A prepare job that failed after its push re-runs the same way, skipping the commit.
- Given a second Run workflow while one is running, when it starts after the first finishes, then it works out the version the first one released and fails before committing, saying to dispatch again.
- Given a pushed pre-release tag (`v2.42.0-rc.1`) on a commit whose `package.json` says that version, when the workflow runs, then it builds and publishes a pre-release the same way and commits nothing to main.
- Given an app running out of this checkout, on any of the three platforms, when `pnpm run package` runs, then it stops before deleting the files that app is executing.
- Given a test that makes a temporary folder and never removes it, when `pnpm test` ends, then the run fails naming the folder's prefix and count, and nothing it made is left in `/tmp`.
- Given a clean `pnpm test`, when it ends, then `/tmp` holds the same `dashboard-*`, `create-task-*` and `board-files-*` folders it held before.
- Given two branches cut after #167 that each append a line to the same `docs/**/history.md`, when one merges the other, then both lines are kept and git reports no conflict. A branch cut before #167 still conflicts once, on the merge that brings `.gitattributes` in.
