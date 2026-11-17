import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { posixQuoted } from '../../shared/panes/shell';
import { git as runGit } from '../app/git';

// Whether the `/pr-loop` a review runs is there, and whether it is current. It is not the app's: it
// comes from a checkout of naeemba/claude-pr-loop, whose install.sh links each command into
// ~/.claude/commands and copies the workflow into ~/.claude/workflows. The repository is used on its
// own too, so the app checks it rather than bundling it (ship-decision-4).

const REVIEW_LOOP_INSTALL = 'git clone https://github.com/naeemba/claude-pr-loop && cd claude-pr-loop && ./install.sh';

const DAY_MS = 24 * 60 * 60 * 1000;

// Where install.sh puts it: $HOME/.claude.
export const CLAUDE_FOLDER = path.join(homedir(), '.claude');

function commandsFolder(claudeFolder: string): string {
  return path.join(claudeFolder, 'commands');
}

function loopCommand(claudeFolder: string): string {
  return path.join(commandsFolder(claudeFolder), 'pr-loop.md');
}

// Why a review cannot start for want of `/pr-loop`, or null when the command is there. A link whose
// checkout has gone counts as missing: the session would read nothing. review-flow.ts refuses on it.
export function reviewLoopMissing(claudeFolder: string): string | null {
  if (existsSync(loopCommand(claudeFolder))) return null;
  return `/pr-loop is not installed (no ${loopCommand(claudeFolder)}); install it with \`${REVIEW_LOOP_INSTALL}\`, then start the review again`;
}

// Where a link points, resolved the way the file system does, or null for a file that is not a link.
function linkTarget(link: string): string | null {
  try {
    return lstatSync(link).isSymbolicLink() ? path.resolve(path.dirname(link), readlinkSync(link)) : null;
  } catch {
    return null;
  }
}

function filesIn(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

function sameFile(a: string, b: string): boolean {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

// What is wrong with an installed `/pr-loop`, each list empty when nothing is.
export type ReviewLoopStaleness = {
  checkout: string;
  // Commits origin's default branch has that the checkout lacks.
  behind: number;
  // The checkout's workflows whose copy in ~/.claude/workflows is missing or different.
  workflows: string[];
  // Command links into the checkout whose file has gone.
  dangling: string[];
};

export type ReviewLoopGit = (programArguments: string[], cwd: string) => Promise<string>;

// The checkout `pr-loop.md` links into, asked how far it is from what was shipped. Null when there is
// no link to follow: a missing command is the refusal's, and a copied one has no checkout to ask.
// Fetches at most once a day, read off FETCH_HEAD, so a relaunch does not reach GitHub again; a fetch
// or count that fails (offline, no origin/HEAD) counts as not behind.
export async function reviewLoopStaleness(claudeFolder: string, git: ReviewLoopGit, now: number): Promise<ReviewLoopStaleness | null> {
  const target = linkTarget(loopCommand(claudeFolder));
  if (target === null) return null;
  const checkout = path.dirname(path.dirname(target));
  let fetched = 0;
  try {
    // ponytail: assumes .git is a folder; a checkout that is itself a worktree fetches on every check.
    fetched = statSync(path.join(checkout, '.git', 'FETCH_HEAD')).mtimeMs;
  } catch {
    // Never fetched.
  }
  if (now - fetched > DAY_MS) await git(['fetch', '--quiet', 'origin'], checkout).catch(() => '');
  const count = await git(['rev-list', '--count', 'HEAD..refs/remotes/origin/HEAD'], checkout).catch(() => '');
  const workflows = filesIn(path.join(checkout, 'workflows'))
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !sameFile(path.join(checkout, 'workflows', name), path.join(claudeFolder, 'workflows', name)));
  const commands = commandsFolder(claudeFolder);
  const dangling = filesIn(commands).filter((name) => {
    const linked = linkTarget(path.join(commands, name));
    return linked !== null && linked.startsWith(checkout + path.sep) && !existsSync(linked);
  });
  return { checkout, behind: Number(count) || 0, workflows, dangling };
}

// The status bar's line for a stale install, or null when it is current. Says what to run: install.sh
// copies the workflow and drops a link to a file the checkout no longer has, so a pull alone is not it.
export function reviewLoopNotice(staleness: ReviewLoopStaleness | null): string | null {
  if (staleness === null) return null;
  const { checkout, behind, workflows, dangling } = staleness;
  const problems = [
    behind > 0 ? `the checkout is ${behind} commit${behind === 1 ? '' : 's'} behind origin` : '',
    workflows.length > 0 ? `the installed ${workflows.join(', ')} differs from the checkout's` : '',
    dangling.length > 0 ? `${dangling.join(', ')} in ~/.claude/commands links to nothing` : '',
  ].filter((problem) => problem !== '');
  if (problems.length === 0) return null;
  const run = `cd ${posixQuoted(checkout)} && ${behind > 0 ? 'git pull && ' : ''}./install.sh`;
  return `/pr-loop is out of date: ${problems.join('; ')}. Run \`${run}\``;
}

// The check main runs at launch and at each review start, its line handed to `say` when there is one.
// Not awaited by either: nothing waits on a warning. Reviews started on one tick share the check under
// way, so they do not fetch the one checkout side by side or say the same line once each.
let checking: Promise<void> | null = null;

export function checkReviewLoop(say: (notice: string) => void): void {
  checking ??= reviewLoopStaleness(CLAUDE_FOLDER, (programArguments, cwd) => runGit(programArguments, cwd, { timeout: 60_000 }), Date.now())
    .then(reviewLoopNotice)
    .then((notice) => { if (notice !== null) say(notice); })
    .finally(() => { checking = null; });
}
