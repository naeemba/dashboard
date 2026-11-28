// The `pr` noun: a pull request landed as a command instead of steps a session copies out of a prompt.
// A review worker with merging on runs it too (reviewPrompt in ship/review.ts). Note the head
// commit, wait for every check on it, merge that commit and no other. It is a merge by whoever runs it,
// so review.autoMerge, which gates only what a review worker does unasked, does not gate it. `pr wait`
// is the same wait without the merge, so nobody hand-rolls a sleep and gh loop around CI.

import { NO_HOOKS } from '../app/git';
import { failureLine } from './failure-line';
import { isWriteVerb, parseWriteCommand, type WriteCommand, WRITE_HELP, WRITE_LINES } from './pull-request-write-cli';
import { type GitHubPorts, isNetworkError, type ProgramAnswer, retried, RETRY_MINUTES, RETRY_WAITS_MS } from './gh-answer';

// How many times one land hands a conflict to the branch's agent, and how long it waits on pushes in all,
// across every hand-off: well inside the two-hour background run (LONGEST_BACKGROUND_RUN), so the land
// prints its own verdict before it is stopped and rerun, which would send /pr-conflicts again.
// ponytail: counts only the push waits, not CI between them; a clock deadline if CI eats the margin.
export const HAND_OFFS = 3;
export const NEW_HEAD_POLL_MS = 60_000;
export const NEW_HEAD_WAIT_MS = 90 * 60_000;

export const PULL_REQUEST_USAGE = `pr — open, mark, comment on, wait on or land a pull request of the project you are in

  pr wait <number|url|branch> [--project <name|aka>]
  pr land <number|url|branch> [--keep] [--project <name|aka>]
${WRITE_LINES}

wait notes the pull request's head commit and waits for every check on it (gh pr checks --watch),
merging nothing. land waits the same, then merges that commit: gh pr merge --merge
--match-head-commit <sha>, so a push during the wait is refused rather than merged unchecked. No
checks reported a minute after asking is refused on a draft, since a repository's CI may skip one,
and otherwise passes only in a repository whose recently merged pull requests reported no check;
anywhere else it is refused, since its CI did not start on that commit (a push, or gh pr merge by
hand, if it never will). A pull request GitHub says conflicts with its base is refused at once,
naming the files, since CI does not run on it. A merge call that fails is checked against the pull
request: merged at that commit is merged. A conflict git merges cleanly (GitHub ignores a merge
driver in .gitattributes) is merged and pushed to the branch by wait and land themselves, printing
\`merged <remote>/<base> into <branch> cleanly at <sha>\`. A land that finds a real conflict sends
/pr-conflicts to the agent working its branch (pane conflicted), prints \`sent /pr-conflicts <n> to
<pane>\`. Either then waits for a new head commit and starts over, at most ${HAND_OFFS} times and
${NEW_HEAD_WAIT_MS / 60_000} minutes of waiting in all; a real conflict on a wait, or a land with no agent on the
branch, stops at the conflict. A network error on any gh call is tried
again for about ${RETRY_MINUTES} minutes, waiting longer each time. The last line is the verdict: \`merged <n> at
<sha>\`, \`checks passed on <sha>\`, \`conflicts with <base>: <files>\`, or why not. The wait is as
long as CI takes: run it in the background with the longest timeout allowed; one stopped at that
limit has not failed, run it again. Once merged, the checkout on the base branch (the project's own,
or the worktree that has it) is fast-forwarded when it has nothing uncommitted, so no git pull is
needed after, and the worker pane on its branch is released, unless it is the pane the land runs
in: a line before the verdict says \`released <pane>\` or \`kept <pane>: <why>\` (the keyboard, a
question, mid-turn, typed into by you, or no main handed it work). --keep merges without releasing
it. It runs in the project of the folder you are in, or with --project in that project's folder
from ~/.dashboard/projects.yaml.

${WRITE_HELP}`;

export type PullRequestVerb = 'wait' | 'land';
type Parsed =
  | { ok: true; verb: PullRequestVerb; target: string; keep: boolean }
  | { ok: true; write: WriteCommand }
  | { ok: false; message: string };

// The words after `pr`, with --project already taken out by boardTarget, as `board` takes it.
export function parsePullRequestCommand(commandArguments: readonly string[]): Parsed {
  const [verb, ...words] = commandArguments;
  const keep = verb === 'land' && words.includes('--keep');
  const targets = words.filter((word) => !keep || word !== '--keep');
  if (verb === undefined) return { ok: false, message: PULL_REQUEST_USAGE };
  if (isWriteVerb(verb)) return parseWriteCommand(verb, words);
  if (verb !== 'land' && verb !== 'wait') return { ok: false, message: `no such command: ${verb}\n\n${PULL_REQUEST_USAGE}` };
  // `pr land --help`, or any flag where the pull request goes, would reach gh as the pull request.
  if (targets.some((target) => target.startsWith('-'))) return { ok: false, message: PULL_REQUEST_USAGE };
  if (targets.length !== 1) return { ok: false, message: `pr ${verb} takes one pull request: its number, url or branch` };
  return { ok: true, verb, target: targets[0], keep };
}

// A landed pull request says the branch it merged into, for the fast-forward after (fast-forward-checkout.ts).
// One that conflicts says its base and head, for the files it conflicts on (conflictLine).
// A landed one says its head branch too, whose worker pane the app is asked to release (releaseLanded).
// Its head branch is the one whose worker is handed the conflict (HandOff).
export type Conflicts = { base: string; sha: string; branch: string };
export type LandAnswer = ProgramAnswer & { base?: string; branch?: string; conflicts?: Conflicts };

// gh's words for a pull request whose CI has not started, or that runs none.
const NO_CHECKS = 'no checks reported';
export const NO_CHECKS_WAIT_MS = 60_000;
const reportsNoChecks = (answer: ProgramAnswer) => !answer.ok && answer.output.includes(NO_CHECKS);

const lost = (answer: ProgramAnswer, doing: string): ProgramAnswer => ({ ok: false, output: `${answer.output}\n\nlost gh's answer for ${RETRY_MINUTES} minutes ${doing}; nothing is merged, run it again` });

// A gh call that only reads, tried again on a network error as long as RETRY_WAITS_MS lasts.
const patiently = (ports: GitHubPorts, words: string[]) => retried(ports, words);

// The pull request's state, head commit, base branch, mergeability, url, head branch and whether it is
// a draft, as `OPEN <sha> main MERGEABLE https://... fix-it false`.
const stateAndHead = (target: string) => ['pr', 'view', target, '--json', 'state,headRefOid,baseRefName,mergeable,url,headRefName,isDraft', '-q', '.state + " " + .headRefOid + " " + .baseRefName + " " + .mergeable + " " + .url + " " + .headRefName + " " + (.isDraft | tostring)'];
const readHead = (answer: ProgramAnswer) => {
  const [state = '', sha = '', base = '', mergeable = '', url = '', branch = '', draft = ''] = answer.output.trim().split(' ');
  return { state, sha, base, mergeable, url, branch, draft: draft === 'true' };
};
const conflicting = (answer: ProgramAnswer) => answer.ok && readHead(answer).mergeable === 'CONFLICTING';
// The program prints the files in place of the output (conflictLine), so the output is only a fallback.
const conflictAnswer = (target: string, base: string, sha: string, branch: string): LandAnswer => ({ ok: false, output: `${target} conflicts with ${base}`, conflicts: { base, sha, branch } });

// How many checks the last few merged pull requests of the pull request's own repository reported (read
// from its url, since a url target may name another repository than the folder's): none is a repository
// without CI on pull requests. It asks the pull requests, not Actions, so CI on a push trigger or from an
// outside service counts, and Dependabot or Pages workflows that never report on a pull request do not.
function recentCheckCount(url: string): string[] | undefined {
  const [, repository] = /^https?:\/\/([^/]+\/[^/]+\/[^/]+)\/pull\//.exec(url) ?? [];
  if (repository === undefined) return undefined;
  return ['pr', 'list', '--repo', repository, '--state', 'merged', '--limit', '20', '--json', 'statusCheckRollup', '-q', '[.[].statusCheckRollup | length] | add // 0'];
}

// What the wait found: every check passed on the noted commit, or the answer to print. A failure's
// detail comes first and its verdict last, so the last line is always the one to read.
type Checked = { ok: true; sha: string; base: string; branch: string; noChecks: boolean } | LandAnswer;

// What `pr wait` and `pr land` tell the pane pool around their wait on the checks (workers-decision-11):
// the slot given back while the checks run, and asked for again once they are done, which may wait
// for room. Both nothing outside a main's worker pane.
export type CiSlot = { giveBack(): Promise<void>; reclaim(): Promise<void> };
export type CheckPorts = GitHubPorts & { slot?: CiSlot };

// The wait on the checks, with the slot given back for as long as it lasts, however it ends.
async function slotGivenBack<T>(ports: CheckPorts, wait: () => Promise<T>): Promise<T> {
  await ports.slot?.giveBack();
  try {
    return await wait();
  } finally {
    await ports.slot?.reclaim();
  }
}

async function checksPassed(ports: CheckPorts, target: string): Promise<Checked> {
  const head = await patiently(ports, stateAndHead(target));
  if (isNetworkError(head)) return lost(head, `reading ${target}`);
  if (!head.ok) return head;
  const { state, sha, base, url, branch, draft } = readHead(head);
  if (state !== 'OPEN') return { ok: false, output: `pull request ${target} is ${state.toLowerCase()}, not open` };
  // CI does not run on a pull request that conflicts: waiting on it would end in "no checks reported".
  if (conflicting(head)) return conflictAnswer(target, base, sha, branch);
  const watch = () => patiently(ports, ['pr', 'checks', target, '--watch']);
  const checks = await slotGivenBack(ports, async () => {
    const first = await watch();
    // Right after a push CI may not have started: ask once more a minute on.
    if (!reportsNoChecks(first)) return first;
    await ports.wait(NO_CHECKS_WAIT_MS);
    return watch();
  });
  const noChecks = reportsNoChecks(checks);
  if (isNetworkError(checks)) return lost(checks, `waiting on the checks of ${target}`);
  if (!checks.ok && !noChecks) return { ok: false, output: `${checks.output}\n\na check failed on ${sha}; ${target} is not merged` };
  // Still none a minute on is a repository without CI on pull requests, CI that never started on this
  // commit, or a pull request that came to conflict after the first look.
  if (noChecks) {
    if (conflicting(await patiently(ports, stateAndHead(target)))) return conflictAnswer(target, base, sha, branch);
    // Some repositories' CI skips a draft and some runs on it, so only a draft with no checks is refused.
    if (draft) return { ok: false, output: `no checks reported on ${sha}, and ${target} is a draft, which CI may skip; mark it ready (pr ready ${target}) and run it again if it should run` };
    const checkCount = recentCheckCount(url);
    if (checkCount === undefined) return { ok: false, output: `no checks reported on ${sha}, and gh gave no repository for ${target} to ask whether it has CI; ${target} is not merged` };
    const checksBefore = await patiently(ports, checkCount);
    if (isNetworkError(checksBefore)) return lost(checksBefore, `asking whether ${target}'s repository has CI`);
    if (!checksBefore.ok) return { ok: false, output: `${checksBefore.output}\n\nno checks reported on ${sha}, and gh could not say whether the repository has CI; ${target} is not merged` };
    if (checksBefore.output.trim() !== '0') return { ok: false, output: `no checks reported on ${sha} a minute on, in a repository whose pull requests run CI; ${target} is not merged` };
  }
  return { ok: true, sha, base, branch, noChecks };
}

// A wait resolves only a conflict git merges cleanly; a real one is its verdict, for the session that ran it.
export const waitOnPullRequest = (ports: CheckPorts, target: string, cleanMerge?: HandOff): Promise<LandAnswer> => resolvingConflicts(ports, target, () => waitOnce(ports, target), { cleanMerge });

async function waitOnce(ports: CheckPorts, target: string): Promise<LandAnswer> {
  const checked = await checksPassed(ports, target);
  if (!('sha' in checked)) return checked;
  return { ok: true, output: checked.noChecks ? `no checks to wait on at ${checked.sha}, a repository with no CI` : `checks passed on ${checked.sha}` };
}

// Who resolves a conflict while the wait goes on: true when a merge of the base was pushed for it
// (pushCleanMerge), or an agent on the branch was sent /pr-conflicts.
export type HandOff = (conflicts: Conflicts, target: string) => Promise<boolean>;
type Resolvers = { cleanMerge?: HandOff; agent?: HandOff };

// A land tries the clean merge first and hands the agent only a real conflict.
export const landPullRequest = (ports: CheckPorts, target: string, resolvers: Resolvers = {}): Promise<LandAnswer> => resolvingConflicts(ports, target, () => landOnce(ports, target), resolvers);

// A conflict handed off is waited out: once its merge is pushed (a new head, or the pull request no
// longer open) the wait or land starts over. Nobody took it, NEW_HEAD_WAIT_MS spent waiting, or
// HAND_OFFS spent, and the conflict is the answer, as without a hand-off.
async function resolvingConflicts(ports: CheckPorts, target: string, attempt: () => Promise<LandAnswer>, { cleanMerge, agent }: Resolvers): Promise<LandAnswer> {
  const budget = { left: NEW_HEAD_WAIT_MS };
  let pushedMerge: Conflicts | undefined;
  for (let handedOff = 0; ; handedOff += 1) {
    const answer = await attempt();
    const { conflicts } = answer;
    if (conflicts === undefined || handedOff === HAND_OFFS || conflicts.branch === '' || budget.left <= 0) return pullFirst(answer, pushedMerge);
    const merged = (await cleanMerge?.(conflicts, target)) === true;
    if (merged) pushedMerge = conflicts;
    const handed = merged || (await agent?.(conflicts, target)) === true;
    if (!handed || !(await newHead(ports, target, conflicts.sha, budget))) return pullFirst(answer, pushedMerge);
  }
}

// The verdict is the only line its session reads, so a clean merge pushed to the branch is said in it:
// the session's own checkout is behind, and its next push is refused until it pulls. A land that
// merged needs no more pushes to the branch.
function pullFirst(answer: LandAnswer, pushedMerge: Conflicts | undefined): LandAnswer {
  if (pushedMerge === undefined || (answer.ok && answer.base !== undefined)) return answer;
  const { base, branch } = pushedMerge;
  return { ...answer, output: `${answer.output}; a merge of ${base} was pushed to ${branch}, so pull ${branch} before pushing to it again` };
}

// Polls for the head to move, drawing each minute from the land's one budget.
async function newHead(ports: GitHubPorts, target: string, sha: string, budget: { left: number }): Promise<boolean> {
  while (budget.left > 0) {
    await ports.wait(NEW_HEAD_POLL_MS);
    budget.left -= NEW_HEAD_POLL_MS;
    const head = await patiently(ports, stateAndHead(target));
    const now = readHead(head);
    if (head.ok && (now.sha !== sha || now.state !== 'OPEN')) return true;
  }
  return false;
}

async function landOnce(ports: CheckPorts, target: string): Promise<LandAnswer> {
  const checked = await checksPassed(ports, target);
  if (!('sha' in checked)) return checked;
  const { sha, base, branch, noChecks } = checked;
  const merged = await mergeAt(ports, target, sha);
  if (merged.conflicting === true) return conflictAnswer(target, base, sha, branch);
  if (isNetworkError(merged)) return { ok: false, output: `${merged.output}\n\nlost gh's answer merging ${target} at ${sha}; it may have merged, check before running it again` };
  if (!merged.ok) return { ok: false, output: `${merged.output}\n\ngh refused to merge ${target} at ${sha}` };
  return { ok: true, output: `merged ${target} at ${sha}${noChecks ? ', a repository with no CI' : ''}`, base, branch };
}

// What a land prints before its verdict: the app's answer to `pane landed` for the branch it merged, a
// line per worker pane on it released or kept (workers-decision-1), and nothing for a land that merged
// nothing, with --keep, or with no pane on it. Main's own command closes a finished worker, never a timer.
export async function releaseLanded(landed: (branch: string) => Promise<string>, answer: LandAnswer, keep: boolean): Promise<string> {
  return !answer.ok || keep || answer.branch === undefined || answer.branch === '' ? '' : landed(answer.branch);
}

// A merge whose answer was lost may have gone through: a failed call is read back from the
// pull request, merged at the noted commit is merged, conflicting is said as that, and a network
// error is tried again as long as RETRY_WAITS_MS lasts.
async function mergeAt(ports: GitHubPorts, target: string, sha: string, tries = 0): Promise<ProgramAnswer & { conflicting?: true }> {
  const merged = await ports.gh(['pr', 'merge', target, '--merge', '--match-head-commit', sha]);
  if (merged.ok) return merged;
  // One read per try: the tries around it are the retry, and nesting patiently here would make an
  // outage of four minutes one of half an hour.
  const state = await ports.gh(stateAndHead(target));
  if (state.ok && readHead(state).state === 'MERGED' && readHead(state).sha === sha) return state;
  if (conflicting(state)) return { ...merged, conflicting: true };
  if (tries === RETRY_WAITS_MS.length || !isNetworkError(merged)) return merged;
  await ports.wait(RETRY_WAITS_MS[tries]);
  return mergeAt(ports, target, sha, tries + 1);
}

// git in a folder, as gh is in GitHubPorts: the conflicts here and the fast-forward after (fast-forward-checkout.ts).
export type GitPort = (folder: string, words: string[]) => Promise<ProgramAnswer>;

// The files a conflicting pull request conflicts on, merged in git's own memory (merge-tree), so no
// checkout is touched: the base and the head commit fetched from the project's remote first, then the
// line conflictLine says. A failed fetch, or a git that throws, is the line without the files.
export async function conflictedFiles(git: GitPort, folder: string, remote: string, conflicts: Conflicts): Promise<string> {
  return conflictLine(remote, conflicts.base, await mergedTree(git, folder, remote, conflicts));
}

// A git that throws (none installed) is a failed answer, said in its line.
const caught = (answer: Promise<ProgramAnswer>) => answer.catch((error: unknown): ProgramAnswer => ({ ok: false, output: failureLine(error) }));

const mergedTree = (git: GitPort, folder: string, remote: string, { base, sha }: Conflicts) => caught(git(folder, ['fetch', remote, base, sha])
  .then((fetched) => fetched.ok ? git(folder, mergeTreeWords(remote, base, sha)) : fetched));

// The id merge-tree prints first: its tree, a SHA-1 or a SHA-256.
const TREE_ID = /^[0-9a-f]{40,64}$/;
// A tree merge-tree wrote with nothing conflicted: exit 0 and the tree's id alone.
const cleanTree = (mergeTree: ProgramAnswer) => mergeTree.ok && TREE_ID.test(mergeTree.output.trim()) ? mergeTree.output.trim() : undefined;

// GitHub calls a pull request CONFLICTING that git merges cleanly when .gitattributes merges a file
// its own way (docs/**/history.md is merge=union, which GitHub ignores). That merge needs no agent:
// the clean tree is committed onto the head with the base as second parent (commit-tree, no checkout
// touched) and pushed to the branch, refused unless the branch is still at the head merged. handed is false and the
// line empty on a real conflict, which goes to the agent or the verdict as before.
export async function pushCleanMerge(git: GitPort, folder: string, remote: string, conflicts: Conflicts): Promise<{ handed: boolean; line: string }> {
  const { base, sha, branch } = conflicts;
  const tree = cleanTree(await mergedTree(git, folder, remote, conflicts));
  if (tree === undefined) return { handed: false, line: '' };
  const failed = (doing: string, answer: ProgramAnswer) => ({ handed: false, line: `git merges ${remote}/${base} into ${branch} cleanly, but ${doing} failed: ${answer.output.trim() || 'no answer'}` });
  const commit = await caught(git(folder, ['commit-tree', tree, '-p', sha, '-p', `${remote}/${base}`, '-m', `Merge ${remote}/${base} into ${branch}`]));
  if (!commit.ok) return failed('committing the merge', commit);
  const merge = commit.output.trim();
  // NO_HOOKS: a pre-push test run is minutes for a merge the branch's CI checks anyway. The lease
  // refuses a branch the remote has anywhere but the merged head: one pushed to since, or a fork's
  // branch name the project's remote lacks or has as another branch (its main).
  const pushed = await caught(git(folder, [...NO_HOOKS, 'push', `--force-with-lease=refs/heads/${branch}:${sha}`, remote, `${merge}:refs/heads/${branch}`]));
  if (!pushed.ok) return failed('the push', pushed);
  return { handed: true, line: `merged ${remote}/${base} into ${branch} cleanly at ${merge} and pushed it; pull ${branch} before pushing to it again` };
}

// The words for git to merge the head into the base without touching any checkout: exit 1 and the
// conflicted files after the tree's id when they conflict (git 2.38 on).
const mergeTreeWords = (remote: string, base: string, sha: string) => ['merge-tree', '--write-tree', '--name-only', '--no-messages', `${remote}/${base}`, sha];

// The line main relays to the worker whose branch conflicts: the files, from what merge-tree answered,
// and what to do about them.
export function conflictLine(remote: string, base: string, mergeTree: ProgramAnswer): string {
  if (cleanTree(mergeTree) !== undefined) return `GitHub says it conflicts with ${base}, but git merges it cleanly — merge ${remote}/${base} into the branch, push, and run it again`;
  const [treeId = '', ...files] = mergeTree.output.trim().split('\n');
  const named = !mergeTree.ok && TREE_ID.test(treeId) && files.length > 0
    ? files.join(', ')
    : `git could not name the files (${mergeTree.output.trim() || 'no answer'})`;
  return `conflicts with ${base}: ${named} — merge ${remote}/${base} into the branch, resolve, push, and run it again`;
}
