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
// the remote it is on, which is not always origin (chosenRemote in app/default-branch.ts). The fifth,
// `$4`, is settings.review.autoLoop: whether the app starts a review, which waits on CI, once the
// pull request opens. Off, nothing does, so the agent waits on CI itself.
import { LONGEST_BACKGROUND_RUN } from '../ship/review';

export const BUMP_VERSION = 'bump-version';
export const KEEP_VERSION = 'keep-version';
export const REVIEW_LOOP = 'review-loop';
export const NO_REVIEW_LOOP = 'no-review-loop';

export const WORK_CARD_SKILL = `---
name: work-card
description: Work the board card with this id, start to finish, in the worktree the app already made for it
argument-hint: <card id> [${BUMP_VERSION}|${KEEP_VERSION}] <base branch> <remote> [${REVIEW_LOOP}|${NO_REVIEW_LOOP}]
model: opus
effort: high
---

Work the card whose id is $0, in this worktree, start to finish.

The base branch is \`$2\` and the remote it is on \`$3\`. Run by hand with
fewer words, a missing remote is \`origin\` when \`git remote\` lists it, else
the only remote, else the one the local main (then master) tracks: read every
\`$3\` below as that.

When the host in \`git remote get-url $3\` does not name github, the project is on GitLab:
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

    node "$DASHBOARD_BOARD" list --column Doing; node "$DASHBOARD_BOARD" list --column Review; gh pr list --limit 200 --json number,title,headRefName

(on GitLab, \`glab mr list -P 100\` in place of \`gh pr list\`.) For a card or pull
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
  - number a new id before the commit that adds it, never as a placeholder
    like \`-decision-next\`: a project's commit check can refuse one. Take the
    next number free on \`$3/$2\` and in every open pull request, which other
    workers are numbering at the same time:

        git fetch $3 && { git grep -hE '^## <feature>-(decision|rule)-[0-9]+' $3/$2 -- docs; for n in $(gh pr list --limit 200 --json number -q '.[].number'); do gh pr diff $n; done | grep -E '^\\+## <feature>-(decision|rule)-[0-9]+'; }

    On GitLab the loop is
    \`for n in $(glab mr list -P 100 -F json --jq '.[].iid'); do glab mr diff $n; done\`.
    Name the ids you took in your report to main.
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
  \`/pr-conflicts\` does and commit the merge). Bump from the version there.
  Other cards run in their own worktrees at the same time, and two that
  both took the next one say \`-decision-9\`, or \`1.5.0\`. If the pull
  request later conflicts on one, merge \`$3/$2\` again the same way and
  take the next free one.
- Run the project's checks: the ones its \`CLAUDE.md\` names, else its test,
  type-check and lint scripts. A project with a \`check\` script that runs them
  all and prints a summary (\`pnpm check\`) is checked with that, once: read the
  log it names for a failure rather than running the suite again. Never run
  tests in parallel, or start a second run while one is going. To tell a
  failure from load, rerun only the failed files, never the whole suite. All
  of them must pass. If one fails and you cannot fix it, stop: do not open the pull
  request, and say what failed and why in a comment on the card.
- When the checks list changed files a test leaves partly unrun (a coverage
  line, like \`pnpm check\`'s), each one gets a test for what it leaves
  unrun, or a line in the pull request's body saying why not; run the new
  test files on their own, then the project's type-check and lint once, not
  the whole check again. A file left on that line with neither is the
  review's first round of work.
- Commit in small pieces with messages that say what changed and why.
- When the card adds a docs id, run the id command above a last time right
  before pushing: an id of yours that another pull request has taken since
  moves to the next one free, in a commit of its own, which only the
  markdown check needs to see. Run any earlier, and a pull request opened
  while the checks run takes the same id unseen.
- Push the branch to \`$3\` and open the pull request with \`node
  "$DASHBOARD_COMMAND" pr create\` and \`gh pr create\`'s flags, never \`gh pr
  create\` itself: it rides out a GitHub 5xx and prints the branch's pull
  request when one is open already, where a retry by hand opened a second or
  met \`a pull request already exists\`. Its \`pr ready\` and \`pr comment\`
  stand in for \`gh pr ready\` and \`gh pr comment\` the same way. On
  GitLab, \`glab mr create --target-branch $2 --title "<title>" --description
  "<body>" --push=false --yes\`, which the board records the same way.
- Once the pull request is open, the review: $4.
  \`${REVIEW_LOOP}\` means the app starts a review on it, which waits on CI:
  send main (when your prompt names one) your report now, with its number,
  and end your turn. Do not wait on its CI yourself: a wait left running here
  is killed when that review starts, with the report promised after it.

  \`${NO_REVIEW_LOOP}\`, or anything else, means nothing starts a review, so
  nothing else watches CI: wait on it with \`node "$DASHBOARD_COMMAND" pr wait
  <n>\`, or \`glab ci status --wait\` on GitLab, run in the background
  (${LONGEST_BACKGROUND_RUN}), so you are woken when it exits. A wait stopped
  at that time limit has not failed: run it once more. That is the whole wait:
  no \`gh pr checks\`, \`gh run view\` or \`glab ci status\` by hand in
  between, and no foreground \`sleep\`. Its last line is the verdict; send
  main your report with the number and that verdict.

## The report

The report to main is short: main reads one from every worker, and the
detail goes on the pull request. These lines, each left out when it has
nothing to say:

    Outcome: <one line: what is different now, or why you stopped>
    Pull request: #<n>, and the CI verdict when you waited on it
    Ids taken: <docs ids numbered, the version bumped to>
    Caveats: <what is unchecked or partial, one line each>
    Decision: <what needs the user, with the options and your pick>

No list of files, commits or checks run: those are on the pull request.

## What not to do

- Do not touch the main branch, or any file outside this worktree.
- Do not quit, kill, restart or rebuild any running app, including the one
  whose pane you are running in.
- If the card turns out to be wrong or impossible, stop, say why — as a
  comment on the pull request if one is already open, otherwise in a comment
  on the card.
`;
