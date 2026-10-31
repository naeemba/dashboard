# Workflow

How a change is made and shipped here: never touch the running app, a decision
gets a module and a test, and every merged card bumps the version. Owns no
files; `CLAUDE.md` carries each rule in one line and points at its id here.

## Scenarios

- Given a code change is done, when the checks pass, then the installed app is left running and the change is reported as needing a rebuild.
- Given a rule with branches, when it is written, then it lives in its own module beside a `.test.ts`.
- Given a card's pull request, when it merges, then `package.json` `version` has moved in it.
