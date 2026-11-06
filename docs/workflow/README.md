# Workflow

How a change is made and shipped here: never touch the running app, a decision
gets a module and a test, and the build stamps its commit instead of every card
bumping the version. Owns `.gitattributes`, the CI and release workflows (the release notes and download links in
`scripts/release-notes.mjs`, tested beside it), the pnpm setup and the build
hooks, `scripts/node-pty-built.mjs` and `scripts/no-running-app.mjs` (its rule
in `scripts/running-app.mjs`, tested beside it), written in Node so the same
hook runs on a mac, Linux and Windows; `CLAUDE.md` carries each rule in one
line and points at its id here.

## Scenarios

- Given a code change is done, when the checks pass, then the installed app is left running and the change is reported as needing a rebuild.
- Given a rule with branches, when it is written, then it lives in its own module beside a `.test.ts`.
- Given a card's pull request, when it merges, then `package.json` `version` has not moved in it, and the build it makes shows the merged commit.
- Given a fresh checkout on Windows, when `pnpm start`, `pnpm run package` or `pnpm run make` runs, then node-pty's prebuilt binary is copied into `build/Release`, nothing is compiled, and the package carries conpty and winpty beside `pty.node`.
- Given a pull request, when CI runs, then `windows-latest` installs, type-checks, runs the tests and makes the Squirrel installer without publishing it, and a test that needs POSIX paths, file modes, unix sockets or a half-open socket is skipped there with its reason beside it.
- Given Release → Run workflow on main with a bump, when it runs, then `package.json` and a new `CHANGELOG.md` section (GitHub's generated notes since the last release) are committed to main and tagged `vX.Y.Z`, Linux, Windows and macOS (Apple silicon) each build and upload to a draft release, and the release is published with one download line per platform and a link to README.md's unsigned first-launch steps. Started from any other branch, it fails and says so.
- Given a build leg fails, when the publish job runs, then the release stays a draft and the run names the leg; re-running the failed jobs finishes it. A prepare job that failed after its push re-runs the same way, skipping the commit.
- Given a second Run workflow while one is running, when it starts after the first finishes, then it works out the version the first one released and fails before committing, saying to dispatch again.
- Given a pushed pre-release tag (`v2.42.0-rc.1`) on a commit whose `package.json` says that version, when the workflow runs, then it builds and publishes a pre-release the same way and commits nothing to main.
- Given an app running out of this checkout, on any of the three platforms, when `pnpm run package` runs, then it stops before deleting the files that app is executing.
- Given two branches cut after #167 that each append a line to the same `docs/**/history.md`, when one merges the other, then both lines are kept and git reports no conflict. A branch cut before #167 still conflicts once, on the merge that brings `.gitattributes` in.
