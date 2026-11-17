# Skills

The Claude Code skills the installed app writes under `~/.claude/skills` at every launch, so an
upgrade reaches every Claude session on the machine with no step of its own. A file is rewritten
only when this build's copy differs (`replaceFileIfChanged`), and a skill that cannot be written
logs one warning line and costs only that skill. A dev run (`pnpm start`) installs nothing.

| Skill | What it does | Where it is documented |
|---|---|---|
| `/create-task` | Files one card on the project's board, on its default branch | [board](../board/README.md#create-task) |
| `/adopt-docs` | Moves a repository's docs into the `docs/<feature>/` pattern and opens one pull request | below |
| `/work-card` | Works a shipped card start to finish in its worktree and opens its pull request | below |

The same launch puts the board guard under `~/.claude/dashboard/` and adds its hook to
`~/.claude/settings.json` when it is missing, touching nothing else there
([board](../board/README.md#agents-and-the-board), board-decision-8).

## /adopt-docs

Run inside any repository, `/adopt-docs` reads the code, the existing docs and the merged pull
requests, and writes the pattern this repository uses:

- `docs/<feature>/README.md`: what it is, its files, its scenarios, open questions
- `docs/<feature>/hard-rules.md`: rules whose breaking was seen, with ids `<feature>-rule-N`
- `docs/<feature>/decisions.md`: settled questions with dates and pull requests, ids `<feature>-decision-N`
- `docs/<feature>/history.md`: one dated line per merged pull request
- `docs/README.md`: the index
- the docs rule near the top of `CLAUDE.md` (created if missing), and each existing rule's id

It moves existing docs into the right feature without dropping any text, never deletes a doc it
cannot place, and lists those docs (and any source file no feature claims) in the pull request.
It works in a worktree of `origin/<default branch>` on a `docs/adopt-docs` branch, at
`<repository root>/.adopt-docs`, a fixed path every later command names in full and that is
excluded from the starting checkout's `git status`, so the checkout it starts in is left as it was, and changes only Markdown. A repository whose default branch is already
in the pattern (an index of feature folders and the docs rule in `CLAUDE.md`), or that already has
a `docs/adopt-docs` branch from an earlier run, is skipped with no pull request. Started in a
subfolder rather than the repository's top level, it stops, since the worktree would sit outside
the session's working directory and its `cd` into it would not carry over. It never merges
(skills-decision-1).

The skill's text is `ADOPT_DOCS_SKILL`, written from this repository's own `docs/` as the worked
example. A change to the pattern here (the index's wording, the id scheme, the CLAUDE.md rule)
changes that text in the same pull request; `CLAUDE.md` says so beside the docs rule
(skills-decision-2). `adopt-docs-skill.test.ts` fails when the docs rule in `CLAUDE.md` or the
preamble of `docs/README.md` is no longer in that text, word for word (line breaks and indent
aside).

## /work-card

What a shipped card's agent is started on: `/work-card <card id> bump-version|keep-version <base branch>`
([ship](../ship/README.md)). It reads the card and its subtasks and the project's `CLAUDE.md`, does
the work, runs the project's checks and opens the pull request. The checks are the ones `CLAUDE.md`
names, else the project's test, type-check and lint scripts, through the package manager its
lockfile names. The second word is the project's `bumpVersion` in `projects.yaml`
(projects-decision-1): `keep-version`, the default, tells the agent to leave every version alone;
`bump-version` tells it to bump last, from `origin/<base branch>` (the third word, the branch the
worktree was cut from), with `npm version --no-git-tag-version`.

It does not repeat what every worker is already told or held to: the board's rules are
`BOARD_INSTRUCTIONS`, appended to every worker's system prompt, and the board guard's hook refuses
the board edits. It does say not to quit, kill, restart or rebuild any running app: the running-app
guard refuses only commands aimed at the Dashboard app, and another project's app is not covered. A skill in `~/.claude/skills/` wins over a `~/.claude/commands/` file of the same
name ([Claude Code skills](https://code.claude.com/docs/en/skills), "Resolve skills that share a
name"), so an older `~/.claude/commands/work-card.md` is shadowed by the app's copy, not run.

## Rolling /adopt-docs out to every project

The rollout is the manager's, run by hand from the manager session; nothing in the app starts it
(skills-decision-1).
For each project in `~/.dashboard/projects.yaml` other than `dashboard`:

    node "$DASHBOARD_COMMAND" pane claim --project <name>
    node "$DASHBOARD_COMMAND" pane run <pane> '/adopt-docs'

Each worker runs `/adopt-docs` in its project and ends on one of three lines: that project's pull
request URL, "already in the docs pattern", or "earlier run: docs/adopt-docs exists". Its hook tells the manager when it is done; the manager reads that
line from each pane, collects one pull request link per project, and merges none of them.

## Files

Folders: `src/main/skills/`.

- Which skills are installed, and the warning lines: `install-skills.ts`, `install-skills.test.ts`
- The text of `/adopt-docs`, and the test that it carries this repository's docs rule and index preamble: `adopt-docs-skill.ts`, `adopt-docs-skill.test.ts`
- The text of `/work-card` and the words a ship passes it: `work-card-skill.ts`; `ship-flow.test.ts` pins that a ship asks about the project's path and passes its base
- Where a skill's folder and its SKILL.md are: `skill-folder.ts`
- Wired in `main.ts` at `ready`, after the window opens, in the packaged app only

## Scenarios

- Given an installed app, when it launches, then `~/.claude/skills/adopt-docs/SKILL.md`, `~/.claude/skills/work-card/SKILL.md` and the three `/create-task` files are written.
- Given a `~/.claude/commands/work-card.md`, when a ship starts `/work-card`, then the app's skill runs, not that file.
- Given a launch whose skill files already match this build, when it runs, then no file is rewritten.
- Given a build missing the `/create-task` program, when it launches, then `/adopt-docs` is still installed and one warning is logged.
- Given a repository whose main checkout is on a branch with uncommitted work, when `/adopt-docs` runs there, then the pull request is opened from its own worktree and the checkout is unchanged.
- Given a repository whose default branch is already in the pattern, when `/adopt-docs` runs from a checkout on an older branch, then it says "already in the docs pattern" and opens nothing.
- Given a repository with a `docs/adopt-docs` branch, when `/adopt-docs` runs, then it says "earlier run: docs/adopt-docs exists" and opens nothing.
- Given a change to the docs rule in `CLAUDE.md` or the preamble of `docs/README.md`, when `pnpm test` runs without the same change to `ADOPT_DOCS_SKILL`, then it fails naming the file that changed.
