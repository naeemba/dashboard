# Skills

The Claude Code skills the installed app writes under `~/.claude/skills` at every launch, so an
upgrade reaches every Claude session on the machine with no step of its own. A file is rewritten
only when this build's copy differs (`replaceFileIfChanged`), and a skill that cannot be written
logs one warning line and costs only that skill. A dev run (`pnpm start`) installs nothing.

| Skill | What it does | Where it is documented |
|---|---|---|
| `/create-task` | Files one card on the project's board, on its default branch | [board](../board/README.md#create-task) |
| `/adopt-docs` | Moves a repository's docs into the `docs/<feature>/` pattern and opens one pull request | below |

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
It works in a worktree of `origin/<default branch>` on a `docs/adopt-docs` branch, so the checkout
it starts in is left as it was, and changes only Markdown. A repository already in the pattern
(an index of feature folders and the docs rule in `CLAUDE.md`) is skipped with no pull request.
It never merges.

The skill's text is `ADOPT_DOCS_SKILL`, written from this repository's own `docs/` as the worked
example. A change to the pattern here (the index's wording, the id scheme, the CLAUDE.md rule)
changes that text in the same pull request.

## Rolling /adopt-docs out to every project

The rollout is the manager's, run by hand from the manager session; nothing in the app starts it.
For each project in `~/.dashboard/projects.yaml` other than `dashboard`:

    node "$DASHBOARD_COMMAND" pane claim --project <name>
    node "$DASHBOARD_COMMAND" pane run <pane> '/adopt-docs'

Each worker runs `/adopt-docs` in its project and ends on one line: that project's pull request URL,
or "already in the docs pattern". Its hook tells the manager when it is done; the manager reads that
line from each pane, collects one pull request link per project, and merges none of them.

## Files

Folders: `src/main/skills/`.

- Which skills are installed, and the warning lines: `install-skills.ts`, `install-skills.test.ts`
- The text of `/adopt-docs`: `adopt-docs-skill.ts`
- Wired in `main.ts` at `ready`, after the window opens, in the packaged app only

## Scenarios

- Given an installed app, when it launches, then `~/.claude/skills/adopt-docs/SKILL.md` and the three `/create-task` files are written.
- Given a launch whose skill files already match this build, when it runs, then no file is rewritten.
- Given a build missing the `/create-task` program, when it launches, then `/adopt-docs` is still installed and one warning is logged.
- Given a repository whose main checkout is on a branch with uncommitted work, when `/adopt-docs` runs there, then the pull request is opened from its own worktree and the checkout is unchanged.
- Given a repository already in the pattern, when `/adopt-docs` runs, then it says so and opens nothing.
