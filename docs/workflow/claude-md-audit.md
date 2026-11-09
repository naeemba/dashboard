# CLAUDE.md audit (2026-11-09)

Every rule an agent reads before it starts here, and where it should live. The goal: CLAUDE.md
keeps only what needs judgement; a tool, a hook, a test or the app's own session instructions
carries the rest, and a broken rule is refused where it happens, not remembered.

This is the state after #262 (the board guard hook and `BOARD_INSTRUCTIONS`) and after
naeemba/dotfiles#70 (open; it drops the global "Move the Card on the Board" section). The audit
changes no rule. Each move is a card on this board, high priority, in the order of the last
section. A rule leaves CLAUDE.md only in the card that builds its replacement.

Verdicts:

- **keep**: needs judgement no tool can make.
- **move**: a named tool can enforce it; the row says how, and what happens if that tool fails.
- **delete**: already enforced; the line in CLAUDE.md repeats what the tool says when it refuses.
  An eslint rule counts as enforced only against code; nothing stops an inline
  `eslint-disable`, so a rule eslint carries keeps one line in CLAUDE.md: never an
  `eslint-disable` for it.
- **gone**: already removed elsewhere; no card here.

## Global: `~/.claude/CLAUDE.md` and `rules/` (dotfiles)

| Rule | Verdict | Where, how it is enforced | If the tool fails |
|------|---------|---------------------------|-------------------|
| communication: disagree when warranted | keep | judgement | — |
| communication: honesty over comfort | keep | judgement | — |
| communication: ground factual claims | keep | judgement | — |
| communication: show what actually happens | keep | judgement | — |
| naming: no abbreviations | keep | judgement; a lint list of banned abbreviations would miss most and flag `id`-style exceptions | — |
| file-size: 600 code lines | move (this repo only) | eslint `max-lines` with `skipComments` and `skipBlankLines` at 600, with the rule's exceptions (generated, data-only) as file overrides. Other projects keep the global rule. | A file at 601 lines fails `eslint .` and CI. If the override list gets too broad, the rule is gone again without anyone noticing. |
| final-message | delete (the duplicate) | It reaches the session twice: the `UserPromptSubmit` hook prints it, and the `rules/` folder is loaded too (this session's context lists `rules/final-message.md`, which CLAUDE.md does not import). Keep the hook, move the file out of `rules/`. | None. The hook already carries it. |
| No Self-Reference | keep | `attribution` in `settings.json` already empties the commit and PR trailers. A hook refusing the word "Claude" would refuse this repo, which names Claude screens and the Claude Agent SDK on purpose. | — |
| Run /simplify after code changes | keep | judgement (what counts as trivial); main's dispatch prompt also asks for it | — |
| Shell state does not survive a tool call | keep | how the harness works; nothing refuses a lone `export` | — |
| zsh: never name a variable `path` | move | the `PreToolUse` Bash hook that already blocks spin loops (`block-spin-loops.js`) refuses a `path=`, `local path=` or `typeset path=` assignment and says why | The command runs, every later command in it is `command not found`, and the agent reads that as a missing tool. |
| zsh: quote globs, `$pipestatus`, brace before a colon | keep | too many legal shapes to refuse without false hits | — |
| Codegraph in a worktree | keep | a fallback for a missing index; there is nothing to refuse. Its answers come from main's code, not the worktree branch's, and that cost is accepted | — |
| Bash goes through rtk | keep | one line explaining a hook's output; nothing to enforce | — |
| CodeGraph block | keep | written and owned by codegraph's installer between its markers | — |
| Move the Card on the Board | gone | dotfiles#70 removes it; #262's guard hook and `BOARD_INSTRUCTIONS` carry it | — |

Out of scope, noted: `claude/commands/work-card.md` still tells a worker to bump the version,
which `workflow-rule-3` forbids here, and to move the card and edit `board.json`. A dotfiles
worker is fixing that file.

## Project: `CLAUDE.md` (this repo)

| Rule | Verdict | Where, how it is enforced | If the tool fails |
|------|---------|---------------------------|-------------------|
| Docs: a feature's change changes its docs | keep | judgement; the "Owns" lines in each README are prose, not a map a check could read | — |
| Docs pattern changes `adopt-docs-skill.ts` (skills-decision-2) | move | a test that the docs paragraph in `CLAUDE.md` and the index preamble appear in `adopt-docs-skill.ts` | Every project `/adopt-docs` reaches gets the old pattern, as before. |
| Checks: the three commands | keep | it is the list itself | — |
| No DOM test environment | keep | a fact about the repo | — |
| workflow-rule-1: never quit or restart the app | move | `no-running-app.mjs` already refuses `package` and `make` while the app runs. Add a `PreToolUse` Bash hook, installed by the app the way the board guard is, that refuses `pkill`/`killall` of Dashboard or electron, `osascript ... quit` and `open -a Dashboard`. Keep one line: say the app needs a rebuild, and stop. | A restart stops every Claude screen mid-turn and, with no pane host, kills every worker shell. |
| workflow-rule-2: a decision gets a module and a test | keep | judgement (what is a decision) | — |
| workflow-rule-3: a card does not bump `version` | move | a CI step that fails a pull request whose `package.json` `version` differs from its base, unless the branch is the release workflow's | Two cards both say `1.5.0` and the version tells you nothing; the release bumps on top of it. |
| workflow-rule-4: test folders from `temporaryFolder()` | delete, one line kept | eslint refuses `mkdtemp` in a test, and the vitest guard fails the run naming a leftover. Keep "never an `eslint-disable` for it": a disabled `mkdtemp` with its own cleanup leaves nothing for the guard to report | A test makes its own folder and the shared cleanup never sees it. |
| keys-rule-1: modifier check in every key dialog | move | a test that walks `src/renderer/` for `keydown` listeners reading `event.key` and requires `isModified` or `isBareCharacter` first, with the rule's exceptions as a named list | A dialog swallows Ctrl+B and the board key stops working while it is open. |
| keys-rule-1: a new project view is six rows | keep | judgement; `help.test.ts` already checks every action has a home in help | — |
| keys-rule-1: an action's name starts with its scope | keep | naming judgement | — |
| keys-rule-2: help is part of the change | keep | judgement; `help.test.ts` checks the blurb limit and that every action has a home | — |
| conventions-rule-1: keyboard first | keep | judgement | — |
| conventions-rule-2: every input gets `dir = 'auto'` | move | a vitest test that counts `createElement('input')`/`('textarea')` and `dir = 'auto'` in `src/` and fails when they differ, the two `grep` lines as code | A right-to-left title in a new box renders left to right with its punctuation on the wrong end. |
| conventions-rule-3: `hidden` beside a `display` class | move | a test that reads the stylesheets and, for every class that sets `display`, wants a `[hidden] { display: none }` rule for it | A panel set `hidden` stays on screen because its class sets `display: flex`. |
| errors-rule-1: `String(error)` only in the failure files | move | eslint `no-restricted-syntax` on `String(<identifier named error>)` outside `failure.ts` and `failure-line.ts`; `board-view.ts` gets fixed, not exempted. Keep one line: never an `eslint-disable` for it | A person sees `[object Object]` where the reason should be. |
| errors-rule-1: the refusal's predicate is exported, never copied | keep | judgement | — |
| errors-rule-2: an IPC refusal is a value | keep | judgement (refusal or failure) | — |
| board-rule-1: two writers, only through `board.ts` and `board-store.ts` | keep | the agent side is now refused by the guard hook (#262); the code side is a structure rule | — |
| Seeded `.dashboard/CLAUDE.md` | move | its file-format section was for hand edits, which the guard now refuses. Shrink it to what the board is and `node "$DASHBOARD_BOARD"`, whose usage already says the rest. | An agent reads the format, edits a card, is refused, and loses a turn. |
| actions-rule-1: a state change calls an action | keep | judgement on new doors; `bypasses.test.ts` keeps the old ones from growing | — |
| processes-rule-1, processes-rule-2: systemd scope | delete | processes-rule-1: `process-starts.test.ts` fails on an unlisted file and asks for its reason. processes-rule-2: `install-slices.test.ts` fails when a slice unit that is there gets written over | — |
| app-rule-1: channels are `<noun>:<verb>` | move | a test over the channel table's `handled()` and `listened()` names, one `noun:verb` pattern | A channel named `readBoard` ships, and the next one copies it. |
| app-rule-2: imports stay on their side | delete, one line kept | eslint enforces it and `eslint.config.test.ts` pins it; the advice to move a shared type to `src/shared/` goes into the rule's message. `eslint.config.test.ts` pins the config, not the source, so keep "never an `eslint-disable` for it" | A renderer file imports a type from `src/main/` under an `eslint-disable`, and lint and CI both pass. |

## Cards, in order

Cheap checks first, then the hooks, then the one card that deletes what the others replaced.

1. Lint `String(error)` outside the failure files, and fix `board-view.ts` (errors-rule-1)
2. Test that every input and textarea gets `dir = 'auto'` (conventions-rule-2)
3. Test that every IPC channel is `<noun>:<verb>` (app-rule-1)
4. Test that `adopt-docs-skill.ts` carries the CLAUDE.md docs pattern (skills-decision-2)
5. CI fails a pull request that moves `package.json` `version` (workflow-rule-3)
6. eslint `max-lines` at 600 code lines (file-size)
7. Test that every renderer key handler checks `isModified` first (keys-rule-1)
8. Test that every `display` class has its `[hidden]` rule (conventions-rule-3)
9. Hook that refuses quitting, killing or restarting the running app (workflow-rule-1): `board guard` carries it, workflow-decision-7
10. Hook that refuses a zsh `path=` assignment (dotfiles, global zsh rule)
11. Load the final-message rule once, from its hook (dotfiles)
12. Shrink the seeded `.dashboard/CLAUDE.md` to the board command
13. Delete from CLAUDE.md every rule the cards above moved, and the ones already enforced (workflow-rule-4, processes-rule-1, processes-rule-2, app-rule-2), keeping the one "never an `eslint-disable`" line for each rule eslint carries
