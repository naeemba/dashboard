// The text of /adopt-docs, which install-skills.ts writes to ~/.claude/skills/adopt-docs/SKILL.md.
// Written from this repository's own docs/ as the worked example: when the pattern here changes,
// this text changes with it (docs/skills/README.md).
export const ADOPT_DOCS_SKILL = `---
name: adopt-docs
description: Move this repository's docs into the docs/<feature>/ pattern (README, hard rules, decisions, history), add the docs rule to CLAUDE.md, and open one pull request
---

Move this repository's documentation into the feature docs pattern, then open
one pull request with the change. Docs only: never change code, config, tests or
the board. $ARGUMENTS

## The pattern

    docs/README.md                 the index: one row per feature, one line each
    docs/<feature>/README.md       what it is, its files, its scenarios, open questions
    docs/<feature>/hard-rules.md   rules whose breaking was seen, and what it looked like
    docs/<feature>/decisions.md    settled questions, with why, when and which pull request
    docs/<feature>/history.md      one dated line per merged change

- A feature is a part of the product a person would name: "the board", "sign-in",
  "billing", "the importer". Find them by folder and by what the code does, not
  by file type. Five to fifteen features is usual; one per top-level folder is
  usually too many or too few.
- Every source file is claimed by exactly one feature, in that feature's
  README under \`## Files\`. Tests sit beside what they test.
- \`hard-rules.md\`, \`decisions.md\` and \`history.md\` exist only once they have
  a first entry. Never write an empty one or a placeholder.
- Every rule and decision has a stable id, \`<feature>-rule-N\` and
  \`<feature>-decision-N\`, numbered from 1 and never renumbered.
- Rules that hold for every feature (code style, naming, workflow) go in a
  cross-cutting folder such as \`docs/conventions/\` or \`docs/workflow/\`, listed
  under a \`## Cross-cutting\` heading in the index.

## 1. Stop if it is already done

If \`docs/README.md\` is an index of \`docs/<feature>/README.md\` folders and the
repository's \`CLAUDE.md\` already says a change to a feature's files changes its
docs, say "already in the docs pattern" and stop. No branch, no pull request.

## 2. Work in a worktree of your own

The checkout you start in may be on someone's branch with work in progress.
Leave it exactly as it is.

    git fetch origin
    git worktree add -b docs/adopt-docs "$(mktemp -d)/adopt-docs" origin/<default branch>

\`<default branch>\` is what \`git symbolic-ref --short refs/remotes/origin/HEAD\`
names (without \`origin/\`), else \`main\`, else \`master\`. Do everything below in
that worktree. A branch named \`docs/adopt-docs\` already on the remote means an
earlier run: stop and say so.

## 3. Read before writing

- Every file in \`docs/\`, the \`README.md\`, \`CLAUDE.md\` (and \`AGENTS.md\` or
  whatever \`CLAUDE.md\` links to or imports with \`@\`), and any other Markdown
  outside \`node_modules\`.
- The source tree: folders, entry points, routes, the schema, what each module
  exports. Enough to say what each feature does and which files are its.
- History: \`git log --merges --first-parent --format='%ad %s' --date=short\` on the
  default branch, and the merged pull requests (\`gh pr list --state merged
  --limit 200 --json number,title,mergedAt,body\`, or \`glab mr list --merged\`
  on GitLab). Commit messages and pull request bodies are where decisions and
  rules come from.

## 4. Write each feature's folder

**README.md**, in this order:

    # <Feature>

    <What it is, for someone who has never seen it. A paragraph or two.>

    ## <How it works, as many sections as it needs>

    ## Files

    Folders: \`src/billing/\`.

    - <what this group does>: \`invoice.ts\`, \`invoice.test.ts\`

    ## Scenarios

    - Given <state>, when <action>, then <outcome>.

    ## Open questions

Scenarios are the behaviour the code shows today, read from the code and its
tests. Do not invent a scenario the code does not do. Open questions are gaps
you found (a TODO, a known bug, two parts that disagree); leave the heading out
when there are none.

**hard-rules.md**, only for a rule whose breaking was seen: a rule in
\`CLAUDE.md\`, a "never"/"always" comment in the code, a fix that names what went
wrong. Each entry says what happens to a person when it is broken, not the
mechanism:

    # <Feature>: hard rules

    The one-line rule is in \`CLAUDE.md\`; this is what breaking it looked like.

    ## <feature>-rule-1: <the rule in a few words>

    <What it guards, and what someone saw when it broke: "a card moved on the
    command line came back with no date, and the board said it was never
    made.">

**decisions.md**, for questions that were settled: an option weighed and
turned down, a "we chose X over Y" in a pull request or commit. Give the date and
the pull request when the history has them. Never invent a reason; if the
history says what was chosen but not why, write only what was chosen.

    # <Feature>: decisions

    Settled questions. Read the entry before re-litigating it.

    ## <feature>-decision-1: <the decision in a few words>

    <What was decided, what it was weighed against, why.> (2026-03-14, #42)

**history.md**, one line per merged change that touched the feature, oldest
first, from the merged pull requests:

    # <Feature>: history

    One line per merged change: date, pull request, why.

    - 2026-03-14 #42 — <why, in one line> (<feature>-decision-1)

## 5. Move what is already there

Every existing doc either moves into a feature (or a cross-cutting folder) or
stays where it is. Nothing is lost:

- Move with \`git mv\` when a whole file belongs to one feature, then reshape it.
  Text that splits across features is copied into each, word for word, before
  being reshaped.
- Every fact, rule, example and link in the old docs is somewhere in the new
  ones. Rewording is fine; dropping is not.
- Specs, plans, research and design notes that are inputs rather than the
  record go to \`docs/<feature>/\` if they belong to one, else stay where they
  are, listed in the index as inputs.
- A doc you cannot place stays exactly where it is. Never delete a doc you
  cannot place. List each one in the pull request.
- Fix every link the move broke, in the docs, the \`README.md\` and \`CLAUDE.md\`.

## 6. Write the index

\`docs/README.md\`:

    # Docs

    One folder per feature. Each feature's \`README.md\` lists the files it owns,
    what it does, its acceptance scenarios and open questions; \`hard-rules.md\`,
    \`decisions.md\` and \`history.md\` appear with their first entry. A file is
    claimed by one feature only, in that feature's README.

    Every rule and decision has a stable id, \`<feature>-rule-N\` and
    \`<feature>-decision-N\`, never renumbered. History lines, pull requests and
    commits cite the id.

    ## Features

    | Feature | What it is |
    |---|---|
    | [billing](billing/README.md) | <one line> |

then \`## Cross-cutting\` if there is any, then a line for each input folder.

## 7. Add the docs rule to CLAUDE.md

Create \`CLAUDE.md\` at the root if it is missing. Edit the file it links to or
imports when it is a link or an \`@\` import. Near the top, under the title:

    Feature docs live in \`docs/\`; a change to a feature's files changes its docs
    in the same PR. \`docs/README.md\` is the index. Each rule below names the id of
    the entry saying what breaking it looked like, in
    \`docs/<feature>/hard-rules.md\`; settled questions are in each feature's
    \`decisions.md\`. Read the entry before arguing with a rule.

Then end each rule already in \`CLAUDE.md\` that now has a hard-rules entry
with its id in brackets: \`(billing-rule-1)\`. Keep every rule's wording;
\`CLAUDE.md\` stays the one-line rules, the docs hold the why.

## 8. Check, commit, open the pull request

- Every source file is claimed by one feature, and only one. List any you left
  unclaimed in the pull request.
- Every link in \`docs/\`, \`README.md\` and \`CLAUDE.md\` resolves.
- \`git diff --stat origin/<default branch>\` shows only Markdown.
- Commit in a few pieces (the moves, the new folders, the index and
  \`CLAUDE.md\`), push, and open the pull request with \`gh pr create\` (or
  \`glab mr create\`). The body says which features there are, what moved where,
  every doc left unplaced and why, and every file left unclaimed. Do not merge.
- Remove your worktree (\`git worktree remove\`); the branch stays.

Print the pull request's URL and stop.
`;
