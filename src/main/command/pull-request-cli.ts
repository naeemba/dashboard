// The `pr` noun: a pull request landed the way a review worker with merging on lands one (reviewPrompt
// in ship/review.ts), as a command instead of steps a session copies out of a prompt. Note the head
// commit, wait for every check on it, merge that commit and no other. It is a merge by whoever runs it,
// so review.autoMerge, which gates only what a review worker does unasked, does not gate it.

export const PULL_REQUEST_USAGE = `pr — land a pull request of the project you are in

  pr land <number|url|branch> [--project <name|aka>]

land notes the pull request's head commit, waits for every check on it (gh pr checks --watch), then
merges that commit: gh pr merge --merge --match-head-commit <sha>, so a push during the wait is
refused rather than merged unchecked. No checks reported a minute after asking is a repository with
no CI, and it is merged. A failed check or a refused merge is printed and the pull request stays
open. The wait is as long as CI takes: run it in the background with the longest timeout allowed;
a land stopped at that limit has not failed, run it again. It runs in the project of the folder
you are in, or with --project in that project's folder from ~/.dashboard/projects.yaml.`;

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

// What gh answered: whether it exited 0, and what it printed on either stream.
export type GitHubAnswer = { ok: boolean; output: string };
export type LandPorts = { gh(words: string[]): Promise<GitHubAnswer>; wait(milliseconds: number): Promise<void> };

// gh's words for a pull request whose CI has not started, or that runs none.
const NO_CHECKS = 'no checks reported';
export const NO_CHECKS_WAIT_MS = 60_000;
const reportsNoChecks = (answer: GitHubAnswer) => !answer.ok && answer.output.includes(NO_CHECKS);

export async function landPullRequest(ports: LandPorts, target: string): Promise<GitHubAnswer> {
  const head = await ports.gh(['pr', 'view', target, '--json', 'state,headRefOid', '-q', '.state + " " + .headRefOid']);
  if (!head.ok) return head;
  const [state, sha] = head.output.trim().split(' ');
  if (state !== 'OPEN') return { ok: false, output: `pull request ${target} is ${state.toLowerCase()}, not open` };
  const watch = () => ports.gh(['pr', 'checks', target, '--watch']);
  let checks = await watch();
  // Right after a push CI may not have started: ask once more a minute on.
  if (reportsNoChecks(checks)) {
    await ports.wait(NO_CHECKS_WAIT_MS);
    checks = await watch();
  }
  const noChecks = reportsNoChecks(checks);
  if (!checks.ok && !noChecks) return { ok: false, output: `a check failed on ${sha}; ${target} is not merged\n\n${checks.output}` };
  const merged = await ports.gh(['pr', 'merge', target, '--merge', '--match-head-commit', sha]);
  if (!merged.ok) return { ok: false, output: `gh refused to merge ${target} at ${sha}: ${merged.output}` };
  return { ok: true, output: `merged ${target} at ${sha}${noChecks ? ', with no checks reported' : ''}` };
}
