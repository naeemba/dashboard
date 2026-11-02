# Workflow

How a change is made and shipped here: never touch the running app, a decision
gets a module and a test, and the build stamps its commit instead of every card
bumping the version. Owns `.gitattributes` and npm's two build hooks,
`scripts/node-pty-built.mjs` and `scripts/no-running-app.mjs` (its rule in
`scripts/running-app.mjs`, tested beside it), written in Node so
the same hook runs on a mac, Linux and Windows, and the CI workflow,
`.github/workflows/ci.yml`, with its Ubuntu checks job and its Windows job; `CLAUDE.md` carries each rule in one
line and points at its id here.

## Scenarios

- Given a code change is done, when the checks pass, then the installed app is left running and the change is reported as needing a rebuild.
- Given a rule with branches, when it is written, then it lives in its own module beside a `.test.ts`.
- Given a card's pull request, when it merges, then `package.json` `version` has not moved in it, and the build it makes shows the merged commit.
- Given a fresh checkout on Windows, when `npm start` or `npm run package` runs, then node-pty's prebuilt binary is copied into `build/Release`, nothing is compiled, and the package carries conpty and winpty beside `pty.node`.
- Given a pull request, when CI runs, then `windows-latest` installs, type-checks, runs the tests and makes the Squirrel installer without publishing it, and a test that needs POSIX paths, file modes, unix sockets or a half-open socket is skipped there with its reason beside it.
- Given an app running out of this checkout, on any of the three platforms, when `npm run package` runs, then it stops before deleting the files that app is executing.
- Given two branches cut after #167 that each append a line to the same `docs/**/history.md`, when one merges the other, then both lines are kept and git reports no conflict. A branch cut before #167 still conflicts once, on the merge that brings `.gitattributes` in.
