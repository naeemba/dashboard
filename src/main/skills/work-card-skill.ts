// /work-card, the command a shipped card's agent is started on (workPrompt in ship/ship.ts). The app
// owns it so a ship never depends on a file outside the app: installSkills writes it to
// ~/.claude/skills/work-card/SKILL.md at every launch. A skill there wins over a
// ~/.claude/commands/work-card.md of the same name, so an old dotfiles copy is shadowed, not run.
//
// Nothing here repeats what every worker is already told or held to: the board's rules are
// BOARD_INSTRUCTIONS (workers/dispatch.ts). The guard hook refuses only commands aimed at the Dashboard
// app itself, so the skill still says not to quit any running app: another project's is not guarded.

// The second word of the prompt: whether this project bumps its version, from its projects.yaml
// entry (projects-decision-1). Always one of the two, so `$1` is never left in the text unfilled. The
// third, `$2`, is the branch the worktree was cut from, which is not always main.
export const BUMP_VERSION = 'bump-version';
export const KEEP_VERSION = 'keep-version';

export const WORK_CARD_SKILL = `---
name: work-card
description: Work the board card with this id, start to finish, in the worktree the app already made for it
argument-hint: <card id> [${BUMP_VERSION}|${KEEP_VERSION}] <base branch>
model: opus
effort: high
---

Work the card whose id is $0, in this worktree, start to finish.

You are already on the right branch and in the right folder. The app made
this worktree for this card, moved the card into it, and started you in a
pane here — none of that is yours to redo.

## Read the card first

Read the card with \`node "$DASHBOARD_BOARD" show $0\`. Read its title, its
description, its priority, and every card whose parent is this card (\`list\`
shows them) — those are its subtasks and they are part of the job.

Read \`CLAUDE.md\` at the top of the repository before you write anything. It
is not optional and it is not a summary of the code; it is the rules this
project is held to.

## Then do the work

- Before changing a function that already exists, ask what calls it.
- Build what the card asks for, following the project's own rules.
- The version: $1.
  \`${KEEP_VERSION}\`, or anything but \`${BUMP_VERSION}\`, means this project
  does not bump its version for a card: leave \`package.json\`'s version, and
  every other place the project keeps one, as it is, even if something else
  you read says to bump it. A project whose CI refuses a version change fails
  the pull request on it.

  \`${BUMP_VERSION}\` means bump the version to match the card, in the same
  branch as the work. A bug fix is a patch, a new capability is a minor,
  something that breaks how the thing is already used is a major. Skip it
  when nothing shipped: a card that only moved documentation around is not a
  release. The version is how anybody tells an installed copy from what has
  been merged.

  Bump last, right before you open the pull request, and bump from what the
  base branch, \`$2\`, says then. Other cards run in their own worktrees at the
  same time, and two that both bumped from \`1.4.0\` early both say \`1.5.0\`.
  So first run \`git fetch origin && git merge origin/$2\` — the local \`$2\`
  here is as old as the worktree — then bump. If the merge conflicts, resolve it the way
  \`/pr-conflicts\` does, commit the merge, then bump.

  Bump with \`npm version <patch|minor|major> --no-git-tag-version\`, whatever
  the package manager: it rewrites \`package.json\` and a \`package-lock.json\`
  if there is one, and makes no commit and no tag. A tag is shared by every
  worktree, so the next card to reach the same number would fail on it. A
  project with no \`package.json\` is bumped wherever it keeps its version.
  Commit the bump on its own. If the pull request later conflicts on the
  version, merge \`origin/$2\` the same way, keep its number and bump again
  from it.
- Run the project's checks: the ones its \`CLAUDE.md\` names, else its test,
  type-check and lint scripts. Run them through the package manager its
  lockfile names — \`pnpm-lock.yaml\` is pnpm, \`yarn.lock\` yarn, \`bun.lock\` or
  \`bun.lockb\` bun, \`package-lock.json\` npm — never a different one: npm in a
  pnpm project writes a \`package-lock.json\` nobody wants. All of them must
  pass. If one fails and you cannot fix it, stop: do not open the pull
  request, and say what failed and why in a comment on the card.
- Commit in small pieces with messages that say what changed and why.
- Push the branch and open the pull request with \`gh pr create\`.

## What not to do

- Do not touch the main branch, or any file outside this worktree.
- Do not quit, kill, restart or rebuild any running app, including the one
  whose pane you are running in.
- Do not remove this worktree when you are finished — that is done by hand,
  from the app's worktree list.
- If the card turns out to be wrong or impossible, stop, say why — as a
  comment on the pull request if one is already open, otherwise in a comment
  on the card.
`;
