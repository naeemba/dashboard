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

// The workflow a GitHub review calls by path (review.ts), the copy install.sh leaves.
export function loopWorkflow(claudeFolder: string): string {
  return path.join(claudeFolder, 'workflows', 'pr-loop.js');
}

// Why a review cannot start for want of `/pr-loop`, or null when the command is there. A link whose
// checkout has gone counts as missing: the session would read nothing. review-flow.ts refuses on it.
// So does a workflow copy that is missing or differs from its checkout's: the review calls the copy
// directly, and an old one runs old rounds next to new command files. This is the `cmp` /pr-loop's
// own first step makes, made here so no review worker spends a turn on it.
export function reviewLoopMissing(claudeFolder: string): string | null {
  const command = loopCommand(claudeFolder);
  if (!existsSync(command)) {
    return `/pr-loop is not installed (no ${command}); install it with \`${REVIEW_LOOP_INSTALL}\`, then start the review again`;
  }
  const checkout = loopCheckout(claudeFolder);
  const installed = loopWorkflow(claudeFolder);
  const stale = `${installed} is missing or differs from the checkout's; run`;
  if (checkout === null) return existsSync(installed) ? null : `${stale} \`${REVIEW_LOOP_INSTALL}\`, then start the review again`;
  if (sameFile(installed, loopWorkflow(checkout))) return null;
  return `${stale} \`${installLine(checkout, false)}\`, then start the review again`;
}

// The checkout `pr-loop.md` links into, or null for a command that is a plain file.
function loopCheckout(claudeFolder: string): string | null {
  const target = linkTarget(loopCommand(claudeFolder));
  return target === null ? null : path.dirname(path.dirname(target));
}

// What to run in the checkout to bring ~/.claude up to it.
function installLine(checkout: string, pull: boolean): string {
  return `cd ${posixQuoted(checkout)} && ${pull ? 'git pull && ' : ''}./install.sh`;
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

function sameFile(installed: string, shipped: string): boolean {
  try {
    return readFileSync(installed).equals(readFileSync(shipped));
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
  // Checkout files install.sh links (as `commands/x.md`) with nothing of that name in ~/.claude.
  unlinked: string[];
  // Links in ~/.claude (as `commands/x.md`) into the checkout whose file has gone.
  dangling: string[];
};

// The folders install.sh links file by file, and the files it links in each.
const LINKED: [string, string][] = [['commands', '.md'], ['review', '.md'], ['scripts', '.sh']];

export type ReviewLoopGit = (programArguments: string[], cwd: string) => Promise<string>;

// The checkout `pr-loop.md` links into, asked how far it is from what was shipped. Null when there is
// no checkout to ask: a missing command or a gone checkout is the refusal's, and a copied one has none.
// Fetches at most once a day, read off FETCH_HEAD, so a relaunch does not reach GitHub again; a fetch
// or count that fails (offline, no origin/HEAD) counts as not behind.
export async function reviewLoopStaleness(claudeFolder: string, git: ReviewLoopGit, now: number): Promise<ReviewLoopStaleness | null> {
  const checkout = loopCheckout(claudeFolder);
  if (checkout === null || !existsSync(checkout)) return null;
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
    .filter((name) => !sameFile(path.join(claudeFolder, 'workflows', name), path.join(checkout, 'workflows', name)));
  const unlinked: string[] = [];
  const dangling: string[] = [];
  for (const [folder, extension] of LINKED) {
    for (const name of filesIn(path.join(checkout, folder)).filter((file) => file.endsWith(extension))) {
      const entry = path.join(claudeFolder, folder, name);
      if (linkTarget(entry) === null && !existsSync(entry)) unlinked.push(`${folder}/${name}`);
    }
    for (const name of filesIn(path.join(claudeFolder, folder))) {
      const linked = linkTarget(path.join(claudeFolder, folder, name));
      if (linked !== null && linked.startsWith(checkout + path.sep) && !existsSync(linked)) dangling.push(`${folder}/${name}`);
    }
  }
  return { checkout, behind: Number(count) || 0, workflows, unlinked, dangling };
}

// The status bar's line for a stale install, or null when it is current. Says what to run: install.sh
// copies the workflow and drops a link to a file the checkout no longer has, so a pull alone is not it.
export function reviewLoopNotice(staleness: ReviewLoopStaleness | null): string | null {
  if (staleness === null) return null;
  const { checkout, behind, workflows, unlinked, dangling } = staleness;
  const problems = [
    behind > 0 ? `the checkout is ${behind} commit${behind === 1 ? '' : 's'} behind origin` : '',
    workflows.length > 0 ? `the installed ${workflows.join(', ')} differs from the checkout's` : '',
    unlinked.length > 0 ? `${unlinked.join(', ')} is not in ~/.claude` : '',
    dangling.length > 0 ? `${dangling.map((name) => `~/.claude/${name}`).join(', ')} links to nothing` : '',
  ].filter((problem) => problem !== '');
  if (problems.length === 0) return null;
  return `/pr-loop is out of date: ${problems.join('; ')}. Run \`${installLine(checkout, behind > 0)}\``;
}

// The check main runs at launch and at each review start, its line handed to `say`, or '' to take a
// line down once the install is fixed. Not awaited by either: nothing waits on a warning. Reviews
// started on one tick share the check under way, so they do not fetch the one checkout side by side or
// say the same line once each. Returned so a test can wait on it.
let checking: Promise<void> | null = null;

const mainGit: ReviewLoopGit = (programArguments, cwd) => runGit(programArguments, cwd, { timeout: 60_000 });

export function checkReviewLoop(say: (notice: string) => void, claudeFolder = CLAUDE_FOLDER, git = mainGit, now = Date.now): Promise<void> {
  checking ??= reviewLoopStaleness(claudeFolder, git, now())
    .then(reviewLoopNotice)
    .then((notice) => say(notice ?? ''))
    .finally(() => { checking = null; });
  return checking;
}
