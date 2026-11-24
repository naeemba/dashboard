// The `pr` noun: a pull request landed as a command instead of steps a session copies out of a prompt.
// A review worker with merging on runs it too (reviewPrompt in ship/review.ts). Note the head
// commit, wait for every check on it, merge that commit and no other. It is a merge by whoever runs it,
// so review.autoMerge, which gates only what a review worker does unasked, does not gate it. `pr wait`
// is the same wait without the merge, so nobody hand-rolls a sleep and gh loop around CI.

import { failureLine } from './failure-line';

export const PULL_REQUEST_USAGE = `pr — wait on or land a pull request of the project you are in

  pr wait <number|url|branch> [--project <name|aka>]
  pr land <number|url|branch> [--project <name|aka>]

wait notes the pull request's head commit and waits for every check on it (gh pr checks --watch),
merging nothing. land waits the same, then merges that commit: gh pr merge --merge
--match-head-commit <sha>, so a push during the wait is refused rather than merged unchecked. No
checks reported a minute after asking passes only in a repository whose recently merged pull
requests reported no check; anywhere else it is refused, since its CI did not start on that commit (a
push, or gh pr merge by hand, if it never will). A pull request GitHub says conflicts with its base is
refused at once, naming the files, since CI does not run on it. A merge call that fails is checked
against the pull request: merged at that commit is merged. A network error on any gh call is tried
again for about four minutes, waiting longer each time. The last line is the verdict: \`merged <n>
at <sha>\`, \`checks passed on <sha>\`, \`conflicts with <base>: <files>\`, or why not. The wait is as
long as CI takes: run it in the background with the longest timeout allowed; one stopped at that
limit has not failed, run it again. Once merged, the checkout on the base branch (the project's own,
or the worktree that has it) is fast-forwarded when it has nothing uncommitted, so no git pull is
needed after. It runs in the project of the folder you are in, or with --project in that project's
folder from ~/.dashboard/projects.yaml.`;

export type PullRequestVerb = 'wait' | 'land';
type Parsed = { ok: true; verb: PullRequestVerb; target: string } | { ok: false; message: string };

// The words after `pr`, with --project already taken out by boardTarget, as `board` takes it.
export function parsePullRequestCommand(commandArguments: readonly string[]): Parsed {
  const [verb, ...targets] = commandArguments;
  if (verb === undefined) return { ok: false, message: PULL_REQUEST_USAGE };
  if (verb !== 'land' && verb !== 'wait') return { ok: false, message: `no such command: ${verb}\n\n${PULL_REQUEST_USAGE}` };
  // `pr land --help`, or any flag where the pull request goes, would reach gh as the pull request.
  if (targets.some((target) => target.startsWith('-'))) return { ok: false, message: PULL_REQUEST_USAGE };
  if (targets.length !== 1) return { ok: false, message: `pr ${verb} takes one pull request: its number, url or branch` };
  return { ok: true, verb, target: targets[0] };
}

// What gh or git answered: whether it exited 0, and what it printed on either stream.
export type ProgramAnswer = { ok: boolean; output: string };
// A landed pull request says the branch it merged into, for the fast-forward after (fast-forward-checkout.ts).
// One that conflicts says its base and head, for the files it conflicts on (conflictLine).
export type LandAnswer = ProgramAnswer & { base?: string; conflicts?: { base: string; sha: string } };
export type LandPorts = { gh(words: string[]): Promise<ProgramAnswer>; wait(milliseconds: number): Promise<void> };

// gh's words for a pull request whose CI has not started, or that runs none.
const NO_CHECKS = 'no checks reported';
export const NO_CHECKS_WAIT_MS = 60_000;
const reportsNoChecks = (answer: ProgramAnswer) => !answer.ok && answer.output.includes(NO_CHECKS);

// gh's words when the request or its answer was lost on the way, not refused by GitHub: Go's
// `Post "https://...": unexpected EOF`, a reset or timed-out connection, gh's own line when it cannot
// reach the API at all, a 5xx from the API. Only gh's own lines are read: a check row of `gh pr checks`
// is tab-separated and carries the check's description, which may well say `error connecting to postgres`.
const NETWORK_ERROR = /\b(?:Get|Post) "?https?:\/\/|unexpected EOF|connection (?:reset|refused)|i\/o timeout|TLS handshake timeout|error connecting to|HTTP 5\d\d/;
export const isNetworkError = (answer: ProgramAnswer) => !answer.ok && answer.output.split('\n').some((line) => !line.includes('\t') && NETWORK_ERROR.test(line));
// The waits before each try again, about four minutes in all: a Wi-Fi rejoin, a VPN reconnect or a
// minute of GitHub trouble is outlasted, where one try five seconds on was not.
export const RETRY_WAITS_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000];
const RETRY_MINUTES = Math.round(RETRY_WAITS_MS.reduce((sum, each) => sum + each, 0) / 60_000);
const lost = (answer: ProgramAnswer, doing: string): ProgramAnswer => ({ ok: false, output: `${answer.output}\n\nlost gh's answer for ${RETRY_MINUTES} minutes ${doing}; nothing is merged, run it again` });

// A gh call tried again on a network error, as long as RETRY_WAITS_MS lasts.
async function patiently(ports: LandPorts, words: string[]): Promise<ProgramAnswer> {
  let answer = await ports.gh(words);
  for (const milliseconds of RETRY_WAITS_MS) {
    if (!isNetworkError(answer)) return answer;
    await ports.wait(milliseconds);
    answer = await ports.gh(words);
  }
  return answer;
}

// The pull request's state, head commit, base branch, mergeability and url, as
// `OPEN <sha> main MERGEABLE https://...`.
const stateAndHead = (target: string) => ['pr', 'view', target, '--json', 'state,headRefOid,baseRefName,mergeable,url', '-q', '.state + " " + .headRefOid + " " + .baseRefName + " " + .mergeable + " " + .url'];
const readHead = (answer: ProgramAnswer) => {
  const [state = '', sha = '', base = '', mergeable = '', url = ''] = answer.output.trim().split(' ');
  return { state, sha, base, mergeable, url };
};
const conflicting = (answer: ProgramAnswer) => answer.ok && readHead(answer).mergeable === 'CONFLICTING';
// The program prints the files in place of the output (conflictLine), so the output is only a fallback.
const conflictAnswer = (target: string, base: string, sha: string): LandAnswer => ({ ok: false, output: `${target} conflicts with ${base}`, conflicts: { base, sha } });

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
type Checked = { ok: true; sha: string; base: string; noChecks: boolean } | LandAnswer;

async function checksPassed(ports: LandPorts, target: string): Promise<Checked> {
  const head = await patiently(ports, stateAndHead(target));
  if (isNetworkError(head)) return lost(head, `reading ${target}`);
  if (!head.ok) return head;
  const { state, sha, base, url } = readHead(head);
  if (state !== 'OPEN') return { ok: false, output: `pull request ${target} is ${state.toLowerCase()}, not open` };
  // CI does not run on a pull request that conflicts: waiting on it would end in "no checks reported".
  if (conflicting(head)) return conflictAnswer(target, base, sha);
  const watch = () => patiently(ports, ['pr', 'checks', target, '--watch']);
  let checks = await watch();
  // Right after a push CI may not have started: ask once more a minute on.
  if (reportsNoChecks(checks)) {
    await ports.wait(NO_CHECKS_WAIT_MS);
    checks = await watch();
  }
  const noChecks = reportsNoChecks(checks);
  if (isNetworkError(checks)) return lost(checks, `waiting on the checks of ${target}`);
  if (!checks.ok && !noChecks) return { ok: false, output: `${checks.output}\n\na check failed on ${sha}; ${target} is not merged` };
  // Still none a minute on is a repository without CI on pull requests, CI that never started on this
  // commit, or a pull request that came to conflict after the first look.
  if (noChecks) {
    if (conflicting(await patiently(ports, stateAndHead(target)))) return conflictAnswer(target, base, sha);
    const checkCount = recentCheckCount(url);
    if (checkCount === undefined) return { ok: false, output: `no checks reported on ${sha}, and gh gave no repository for ${target} to ask whether it has CI; ${target} is not merged` };
    const checksBefore = await patiently(ports, checkCount);
    if (isNetworkError(checksBefore)) return lost(checksBefore, `asking whether ${target}'s repository has CI`);
    if (!checksBefore.ok) return { ok: false, output: `${checksBefore.output}\n\nno checks reported on ${sha}, and gh could not say whether the repository has CI; ${target} is not merged` };
    if (checksBefore.output.trim() !== '0') return { ok: false, output: `no checks reported on ${sha} a minute on, in a repository whose pull requests run CI; ${target} is not merged` };
  }
  return { ok: true, sha, base, noChecks };
}

export async function waitOnPullRequest(ports: LandPorts, target: string): Promise<LandAnswer> {
  const checked = await checksPassed(ports, target);
  if (!('sha' in checked)) return checked;
  return { ok: true, output: checked.noChecks ? `no checks to wait on at ${checked.sha}, a repository with no CI` : `checks passed on ${checked.sha}` };
}

export async function landPullRequest(ports: LandPorts, target: string): Promise<LandAnswer> {
  const checked = await checksPassed(ports, target);
  if (!('sha' in checked)) return checked;
  const { sha, base, noChecks } = checked;
  const merged = await mergeAt(ports, target, sha);
  if (merged.conflicting === true) return conflictAnswer(target, base, sha);
  if (isNetworkError(merged)) return { ok: false, output: `${merged.output}\n\nlost gh's answer merging ${target} at ${sha}; it may have merged, check before running it again` };
  if (!merged.ok) return { ok: false, output: `${merged.output}\n\ngh refused to merge ${target} at ${sha}` };
  return { ok: true, output: `merged ${target} at ${sha}${noChecks ? ', a repository with no CI' : ''}`, base };
}

// A merge whose answer was lost may have gone through: a failed call is read back from the
// pull request, merged at the noted commit is merged, conflicting is said as that, and a network
// error is tried again as long as RETRY_WAITS_MS lasts.
async function mergeAt(ports: LandPorts, target: string, sha: string, tries = 0): Promise<ProgramAnswer & { conflicting?: true }> {
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

// git in the project's folder, as gh is in LandPorts.
export type GitPort = (words: string[]) => Promise<ProgramAnswer>;

// The files a conflicting pull request conflicts on, merged in git's own memory (merge-tree), so no
// checkout is touched: the base and the head commit fetched from the project's remote first, then the
// line conflictLine says. A failed fetch, or a git that throws, is the line without the files.
export async function conflictedFiles(git: GitPort, remote: string, { base, sha }: NonNullable<LandAnswer['conflicts']>): Promise<string> {
  const tree = await git(['fetch', remote, base, sha])
    .then((fetched) => fetched.ok ? git(mergeTreeWords(remote, base, sha)) : fetched)
    .catch((error: unknown): ProgramAnswer => ({ ok: false, output: failureLine(error) }));
  return conflictLine(remote, base, tree);
}

// The words for git to merge the head into the base without touching any checkout: exit 1 and the
// conflicted files after the tree's id when they conflict (git 2.38 on).
const mergeTreeWords = (remote: string, base: string, sha: string) => ['merge-tree', '--write-tree', '--name-only', '--no-messages', `${remote}/${base}`, sha];

// The line main relays to the worker whose branch conflicts: the files, from what merge-tree answered,
// and what to do about them.
export function conflictLine(remote: string, base: string, mergeTree: ProgramAnswer): string {
  const [treeId = '', ...files] = mergeTree.output.trim().split('\n');
  const named = !mergeTree.ok && /^[0-9a-f]{40,64}$/.test(treeId) && files.length > 0
    ? files.join(', ')
    : `git could not name the files (${mergeTree.output.trim() || 'no answer'})`;
  return `conflicts with ${base}: ${named} — merge ${remote}/${base} into the branch, resolve, push, and run it again`;
}
