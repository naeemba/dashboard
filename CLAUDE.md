# dashboard

Electron terminal dashboard. Each project is a page of a main Claude session and
the worker panes it dispatches into, an nvim, a kanban board and a notes page.

Feature docs live in `docs/`; a change to a feature's files changes its docs
in the same PR. `docs/README.md` is the index. Each rule below names the id of
the entry saying what breaking it looked like, in `docs/<feature>/hard-rules.md`;
settled questions are in each feature's `decisions.md`. Read the entry before
arguing with a rule.

A change to the docs pattern (the index preamble, the id scheme, the docs rule
above) changes `src/main/skills/adopt-docs-skill.ts` in the same PR, or every
project `/adopt-docs` reaches afterwards gets the old pattern. (skills-decision-2)

## Checks

    pnpm test                # vitest, node environment only
    pnpm exec tsc --noEmit
    pnpm exec eslint .

There is no DOM test environment: jsdom is not installed and nothing in `src/`
declares one. A `*.test.ts` can test a decision module, never a view. DOM
behaviour (focus, re-attaching an element, `hidden`) is checked by hand in the
app.

## Hard rules

Rules a test, lint or CI step holds are not repeated here (workflow-decision-8).

- **Never quit, kill, restart or replace the running Dashboard app** unless
  asked in the same conversation, including through a script of your own: the
  hook reads only the command line. After a change: run the checks, say the
  installed app needs a rebuild and restart, stop. (workflow-rule-1)
- **Keyboard first.** Every action is reachable without the mouse; a new choice
  is a row the arrow keys walk, not a button. A click on a row moves the
  selection there, then does what Enter does there. A mouse gesture on one of
  the manager's boards makes that board active first. (conventions-rule-1)
- **Mode keys pass through.** The key naming the mode you are already in goes
  to the pane. A new project view is a row in `PROJECT_MODES`, a row in
  `ACTIONS`, a view in `page.ts`, a branch in `focusMode` and `modeLabel`, and
  a name and blurb in `src/renderer/keys/help.ts`. An action's name starts
  with its scope: it is a key in the user's settings file. (keys-rule-1)
- **A refusal is explained where it is decided.** Export the predicate from the
  file that enforces the refusal; the file that prints the message calls it.
  Never a second copy of the condition, in code or in a comment.
  `blockingChanges` exempts `.dashboard/` on purpose; `changedFiles` does not.
  An error shown to a person goes through `failureText`: never an
  `eslint-disable` for the `String(error)` rule, and never a new file in its
  exempt list. (errors-rule-1)
- **An IPC handler that refuses answers the refusal as a value** (`{ refused }`)
  and throws only for failures. (errors-rule-2)
- **The help dialog is part of the change.** A key, mode or screen change
  updates `src/renderer/keys/help.ts` in the same change: a new key is a row
  in `src/shared/keys/actions.ts` (handler, help, settings and which-key strip
  all read it); a screen that does something new gets its blurb updated, kept to
  `BLURB_WORD_LIMIT` words, with the detail in its feature's README.
  (keys-rule-2)
- **A decision gets its own module and a test.** `renderer.ts` is wiring. A
  rule with branches goes in a small module beside a `.test.ts`. Main-process
  event wiring and spawning are exempt wherever they live; a branch owes a test
  wherever it lives. (workflow-rule-2)
- **The board has two writers.** The app and the `board` command both write
  `.dashboard/board/` (one file per card; an old `board.json` is read, never
  written), only through `board.ts` and `board-store.ts`.
  `board-cli.ts` holds the command's decisions, `board-cli-entry.ts` the file
  and terminal. Main watches the `.dashboard` folder, not the file.
  (board-rule-1)
- **A caller that changes state calls an action.** A new door (IPC handler,
  command answer, key, sweep) calls the action in `src/main/actions/<noun>/`;
  a new kind of change adds one. `bypasses.test.ts` names the calls still made
  outside one: lower a count, never raise it. (actions-rule-1)
- **Never an `eslint-disable`** for the import boundaries between processes (a
  type both sides name moves to `src/shared/`; app-rule-2) or for `mkdtemp` in a
  test (use `temporaryFolder()`; workflow-rule-4), or for `max-lines` (split the
  file; conventions-rule-4).
