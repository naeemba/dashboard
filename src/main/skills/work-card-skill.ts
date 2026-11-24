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
// third, `$2`, is the branch the worktree was cut from, which is not always main; the fourth, `$3`,
// the remote it is on, which is not always origin (chosenRemote in app/default-branch.ts).
export const BUMP_VERSION = 'bump-version';
export const KEEP_VERSION = 'keep-version';

export const WORK_CARD_SKILL = `---
name: work-card
description: Work the board card with this id, start to finish, in the worktree the app already made for it
argument-hint: <card id> [${BUMP_VERSION}|${KEEP_VERSION}] <base branch> <remote>
model: opus
effort: high
---

Work the card whose id is $0, in this worktree, start to finish.

The base branch is \`$2\` and the remote it is on \`$3\`. Run by hand with
fewer words, a missing remote is \`origin\` when \`git remote\` lists it, else
the only remote, else the one the local main (then master) tracks: read every
\`$3\` below as that.

When \`git remote get-url $3\` does not name github, the project is on GitLab:
there a pull request is a merge request, its number the iid (\`!12\`), and
each \`gh pr\` below is its \`glab mr\` twin, named where they differ.

You are already on the right branch and in the right folder. The app made
this worktree for this card, moved the card into it, and started you in a
pane here — none of that is yours to redo.

## Read the card first

Read the card with \`node "$DASHBOARD_BOARD" show $0\`. Read its title, its
description, its priority, and every card under \`Subtasks\` in what it prints
(\`show\` each one) — they are part of the job.

Read \`CLAUDE.md\` at the top of the repository before you write anything. It
is not optional and it is not a summary of the code; it is the rules this
project is held to.

## Find the code

Your first look at the code is this command, with the card's nouns (the
files, symbols and features its title and description name) in the quotes:

    codegraph explore "<the card's nouns>" -p "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"

It runs from the project's checkout, because this worktree has no index of
its own. It shows the checkout's code, not this worktree's: read a file here
before you change it, and never trust it for a file you already changed.
Read only the lines it points you to; never \`cat\` or \`sed\` a whole file to
find something in it. Grep only when the checkout has no \`.codegraph/\`, or
for a string, a config value or a log line.

## Check nobody else is on it

Before you write any code, list what else is in flight, in one call:

    node "$DASHBOARD_BOARD" list --column Doing; node "$DASHBOARD_BOARD" list --column Review; gh pr list --json number,title,headRefName

(on GitLab, \`glab mr list\` in place of \`gh pr list\`.) For a card or pull
request whose title looks near this card, read its files: \`gh pr view <n>
--json files\` for a pull request (\`glab mr diff <n>\` on GitLab); for a card, its branch
from the brackets in \`list\`, \`git diff --stat $3/$2...<branch>\`. If
one covers the same files or the same area, say so in a comment on the card,
naming the card or pull request and the files you both touch.

When your prompt names a main to report to (\`SendMessage to main-... when
done\`), stop there: send main that report now, naming the cards or pull
requests and the files, and end your turn. Main answers in your pane with go
on or stop; do as it says. When your prompt names no main, nobody would answer:
go on after the comment. Two cards built side by side on the same files
conflict after review, and one of them is thrown away.

## Then do the work

- Before changing a function that already exists, ask what calls it.
- The board, pane, project and browser commands are also tools of the
  \`dashboard\` MCP server (\`mcp__dashboard__board_show\`, \`board_comment\`,
  \`browser_screenshot\`): call the tool where there is one.
- To look at any page, read it, check a frontend change on it, or screenshot
  it for the pull request, use the project's browser, never Playwright or
  Claude in Chrome: the \`browser_\` tools, whose screenshot answers with the
  picture and whose \`browser_eval\` runs a script file in the page, or
  \`node "$DASHBOARD_COMMAND" browser --help\`.
- When the project keeps its docs in \`docs/<feature>/\`:
  - update a feature's docs there by grep: \`grep -n\` its \`README.md\` for
    what you changed, and read a rule or decision only by its id
    (\`grep -n -A15 '<feature>-decision-3' docs/<feature>/decisions.md\`).
    Never read a whole \`README.md\` or \`decisions.md\`.
  - a \`history.md\` line for the card goes in the card's commit, before the
    pull request is opened: the date and why, with no pull request number. A
    second commit to add the number is a second push and a second CI run.
  - write a new numbered id as \`<feature>-decision-next\` (or \`-rule-next\`)
    and give it its number last, below, and name the ids you took in your
    report to main.
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

  Bump with \`npm version <patch|minor|major> --no-git-tag-version\`, whatever
  the package manager: it rewrites \`package.json\` and a \`package-lock.json\`
  if there is one, and makes no commit and no tag. A tag is shared by every
  worktree, so the next card to reach the same number would fail on it. A
  project with no \`package.json\` is bumped wherever it keeps its version.
  Commit the bump on its own.
- When the work is done and before the checks, when the card adds a docs id
  or bumps the version: run \`git fetch $3 && git merge $3/$2\` once
  (the local \`$2\` here is as old as the worktree; resolve a conflict the way
  \`/pr-conflicts\` does and commit the merge). Then give each new id the next
  number free there, and bump from the version there. Other cards run in
  their own worktrees at the same time, and two that both took the next one
  early both say \`-decision-9\`, or \`1.5.0\`. If the pull request later
  conflicts on one, merge \`$3/$2\` again the same way and take the next
  free one. Then check none is left:
  \`grep -rnsE '[a-z0-9]-(decision|rule)-next' docs CLAUDE.md\` prints nothing.
- Run the project's checks: the ones its \`CLAUDE.md\` names, else its test,
  type-check and lint scripts. A project with a \`check\` script that runs them
  all and prints a summary (\`pnpm check\`) is checked with that, once: read the
  log it names for a failure rather than running the suite again. Never run
  tests in parallel, or start a second run while one is going. All of them
  must pass. If one fails and you cannot fix it, stop: do not open the pull
  request, and say what failed and why in a comment on the card.
- Commit in small pieces with messages that say what changed and why.
- Push the branch to \`$3\` and open the pull request with \`gh pr create\`; on
  GitLab, \`glab mr create --target-branch $2 --title "<title>" --description
  "<body>" --push=false --yes\`, which the board records the same way.
- To wait for the pull request's CI, run \`node "$DASHBOARD_COMMAND" pr wait <n>\`
  in the background with the longest timeout allowed: it waits on the head
  commit, outlasts a network error, and its last line is the verdict. Never a
  \`sleep\` and \`gh run view\` loop. It asks gh, so on GitLab the wait is
  \`glab ci status --wait\`, run the same way.

## What not to do

- Do not touch the main branch, or any file outside this worktree.
- Do not quit, kill, restart or rebuild any running app, including the one
  whose pane you are running in.
- If the card turns out to be wrong or impossible, stop, say why — as a
  comment on the pull request if one is already open, otherwise in a comment
  on the card.
`;
