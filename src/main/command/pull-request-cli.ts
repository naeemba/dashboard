// The `pr` noun: a pull request landed as a command instead of steps a session copies out of a prompt.
// A review worker with merging on runs it too (reviewPrompt in ship/review.ts). Note the head
// commit, wait for every check on it, merge that commit and no other. It is a merge by whoever runs it,
// so review.autoMerge, which gates only what a review worker does unasked, does not gate it.

export const PULL_REQUEST_USAGE = `pr — land a pull request of the project you are in

  pr land <number|url|branch> [--project <name|aka>]

land notes the pull request's head commit, waits for every check on it (gh pr checks --watch), then
merges that commit: gh pr merge --merge --match-head-commit <sha>, so a push during the wait is
refused rather than merged unchecked. No checks reported a minute after asking is merged only in a
repository whose recently merged pull requests reported no check; anywhere else it is refused, since its
CI did not start on that commit (a push, or gh pr merge by hand, if it never will). A merge call that fails is checked against the pull request: merged at
that commit is merged. A network error on the merge or the wait is tried once more, five seconds
on. A failed check or a refused merge is printed and the pull request stays open. The wait is as
long as CI takes: run it in the background with the longest timeout allowed; a land stopped at that
limit has not failed, run it again. Once merged, the checkout on the base branch (the project's own,
or the worktree that has it) is fast-forwarded when it has nothing uncommitted, so no git pull is
needed after. It runs in the project of the folder you are in, or with --project in that project's
folder from ~/.dashboard/projects.yaml.`;

type Parsed = { ok: true; target: string } | { ok: false; message: string };

// The words after `pr`, with --project already taken out by boardTarget, as `board` takes it.
export function parsePullRequestCommand(commandArguments: readonly string[]): Parsed {
  const [verb, ...targets] = commandArguments;
  if (verb === undefined) return { ok: false, message: PULL_REQUEST_USAGE };
  if (verb !== 'land') return { ok: false, message: `no such command: ${verb}\n\n${PULL_REQUEST_USAGE}` };
  // `pr land --help`, or any flag where the pull request goes, would reach gh as the pull request.
  if (targets.some((target) => target.startsWith('-'))) return { ok: false, message: PULL_REQUEST_USAGE };
  if (targets.length !== 1) return { ok: false, message: 'pr land takes one pull request: its number, url or branch' };
  return { ok: true, target: targets[0] };
}

// What gh or git answered: whether it exited 0, and what it printed on either stream.
export type ProgramAnswer = { ok: boolean; output: string };
// A landed pull request says the branch it merged into, for the fast-forward after (fast-forward-checkout.ts).
export type LandAnswer = ProgramAnswer & { base?: string };
export type LandPorts = { gh(words: string[]): Promise<ProgramAnswer>; wait(milliseconds: number): Promise<void> };

// gh's words for a pull request whose CI has not started, or that runs none.
const NO_CHECKS = 'no checks reported';
export const NO_CHECKS_WAIT_MS = 60_000;
const reportsNoChecks = (answer: ProgramAnswer) => !answer.ok && answer.output.includes(NO_CHECKS);

// gh's words when the request or its answer was lost on the way, not refused by GitHub: Go's
// `Post "https://...": unexpected EOF`, a reset or timed-out connection, a 5xx from the API.
const NETWORK_ERROR = /\b(?:Get|Post) "?https?:\/\/|unexpected EOF|connection (?:reset|refused)|i\/o timeout|TLS handshake timeout|HTTP 5\d\d/;
export const isNetworkError = (answer: ProgramAnswer) => !answer.ok && NETWORK_ERROR.test(answer.output);
// A second try a few seconds on, so a Wi-Fi rejoin or a VPN reconnect does not fail both.
export const RETRY_WAIT_MS = 5_000;

// The pull request's state, head commit, base branch and url, as `OPEN <sha> main https://...`.
const stateAndHead = (target: string) => ['pr', 'view', target, '--json', 'state,headRefOid,baseRefName,url', '-q', '.state + " " + .headRefOid + " " + .baseRefName + " " + .url'];

// How many checks the last few merged pull requests of the pull request's own repository reported (read
// from its url, since a url target may name another repository than the folder's): none is a repository
// without CI on pull requests. It asks the pull requests, not Actions, so CI on a push trigger or from an
// outside service counts, and Dependabot or Pages workflows that never report on a pull request do not.
function recentCheckCount(url: string): string[] | undefined {
  const [, repository] = /^https?:\/\/([^/]+\/[^/]+\/[^/]+)\/pull\//.exec(url) ?? [];
  if (repository === undefined) return undefined;
  return ['pr', 'list', '--repo', repository, '--state', 'merged', '--limit', '20', '--json', 'statusCheckRollup', '-q', '[.[].statusCheckRollup | length] | add // 0'];
}

export async function landPullRequest(ports: LandPorts, target: string): Promise<LandAnswer> {
  const head = await ports.gh(stateAndHead(target));
  if (!head.ok) return head;
  const [state, sha, base, url = ''] = head.output.trim().split(' ');
  if (state !== 'OPEN') return { ok: false, output: `pull request ${target} is ${state.toLowerCase()}, not open` };
  // A watch whose answer was lost is not a failed check: watch once more.
  const watchOnce = () => ports.gh(['pr', 'checks', target, '--watch']);
  const watch = async () => {
    const answer = await watchOnce();
    if (!isNetworkError(answer)) return answer;
    await ports.wait(RETRY_WAIT_MS);
    return watchOnce();
  };
  let checks = await watch();
  // Right after a push CI may not have started: ask once more a minute on.
  if (reportsNoChecks(checks)) {
    await ports.wait(NO_CHECKS_WAIT_MS);
    checks = await watch();
  }
  const noChecks = reportsNoChecks(checks);
  if (isNetworkError(checks)) return { ok: false, output: `lost gh's answer twice waiting on the checks of ${target}; nothing is merged, run it again\n\n${checks.output}` };
  if (!checks.ok && !noChecks) return { ok: false, output: `a check failed on ${sha}; ${target} is not merged\n\n${checks.output}` };
  // Still none a minute on is a repository without CI on pull requests, or CI that never started on this commit.
  if (noChecks) {
    const checkCount = recentCheckCount(url);
    if (checkCount === undefined) return { ok: false, output: `no checks reported on ${sha}, and gh gave no repository for ${target} to ask whether it has CI; ${target} is not merged` };
    const checksBefore = await ports.gh(checkCount);
    if (!checksBefore.ok) return { ok: false, output: `no checks reported on ${sha}, and gh could not say whether the repository has CI; ${target} is not merged: ${checksBefore.output}` };
    if (checksBefore.output.trim() !== '0') return { ok: false, output: `no checks reported on ${sha} a minute on, in a repository whose pull requests run CI; ${target} is not merged` };
  }
  const merged = await mergeAt(ports, target, sha);
  if (isNetworkError(merged)) return { ok: false, output: `lost gh's answer merging ${target} at ${sha}; it may have merged, check before running it again: ${merged.output}` };
  if (!merged.ok) return { ok: false, output: `gh refused to merge ${target} at ${sha}: ${merged.output}` };
  return { ok: true, output: `merged ${target} at ${sha}${noChecks ? ', a repository with no CI' : ''}`, base };
}

// A merge whose answer was lost may have gone through: a failed call is read back from the
// pull request, merged at the noted commit is merged, and a network error is tried once more.
async function mergeAt(ports: LandPorts, target: string, sha: string, retries = 1): Promise<ProgramAnswer> {
  const merged = await ports.gh(['pr', 'merge', target, '--merge', '--match-head-commit', sha]);
  if (merged.ok) return merged;
  const state = await ports.gh(stateAndHead(target));
  const [mergedState, mergedHead] = state.output.trim().split(' ');
  if (state.ok && mergedState === 'MERGED' && mergedHead === sha) return state;
  if (retries === 0 || !isNetworkError(merged)) return merged;
  await ports.wait(RETRY_WAIT_MS);
  return mergeAt(ports, target, sha, retries - 1);
}
