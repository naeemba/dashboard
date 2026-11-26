// `pr create`, `pr ready` and `pr comment`: the gh calls that change a pull request, tried again on a
// GitHub 5xx or lost answer only once GitHub says the lost try did not go through. A worker retrying
// `gh pr create` by hand after a 502 met `a pull request already exists`, since the 502 had opened it.

import { type GitHubPorts, isNetworkError, type Look, type ProgramAnswer, retried, RETRY_MINUTES } from './gh-answer';

export const WRITE_LINES = `  pr create <gh pr create's flags>
  pr ready <number|url|branch> [--undo] [--project <name|aka>]
  pr comment <number|url|branch> --body <text> [--project <name|aka>]`;

export const WRITE_HELP = `create, ready and comment are gh's, made safe to run again: create prints the branch's open
pull request when it has one (its --head branch, in its --repo), and ready says when it is ready
already (a draft already, with --undo). On a network error or a 5xx from GitHub each looks at the
pull request before trying again, for about ${RETRY_MINUTES} minutes, so a lost answer never opens a
second pull request or posts a comment twice. create runs in the folder you are in, never with
--project, whose folder is the project's main checkout and not the branch's worktree, and takes
--repo only with --head, since gh cannot look a pull request up in another repository without it.`;

const WRITE_VERBS = ['create', 'ready', 'comment'] as const;
export type WriteVerb = typeof WRITE_VERBS[number];
export const isWriteVerb = (verb: string): verb is WriteVerb => (WRITE_VERBS as readonly string[]).includes(verb);
export type WriteCommand =
  | { verb: 'create'; words: string[] }
  | { verb: 'ready'; target: string; undo: boolean }
  | { verb: 'comment'; target: string; body: string };
type Parsed = { ok: true; write: WriteCommand } | { ok: false; message: string };

export function parseWriteCommand(verb: WriteVerb, words: readonly string[]): Parsed {
  if (verb === 'create') {
    // gh pr view refuses --repo without a target, so the look could never find the pull request.
    if (flagValue(words, '--repo', '-R') !== undefined && flagValue(words, '--head', '-H') === undefined) return { ok: false, message: 'pr create takes --repo only with --head <branch>' };
    return { ok: true, write: { verb, words: [...words] } };
  }
  if (verb === 'ready') {
    const undo = words.includes('--undo');
    const targets = words.filter((word) => word !== '--undo');
    if (targets.length !== 1 || targets[0].startsWith('-')) return { ok: false, message: 'pr ready takes one pull request, and --undo to make it a draft' };
    return { ok: true, write: { verb, target: targets[0], undo } };
  }
  const at = words.findIndex((word) => word === '--body' || word === '-b');
  const body = at === -1 ? undefined : words[at + 1];
  const targets = words.filter((_, index) => index !== at && index !== at + 1);
  if (body === undefined || targets.length !== 1 || targets[0].startsWith('-')) return { ok: false, message: 'pr comment takes one pull request and --body <text>' };
  return { ok: true, write: { verb, target: targets[0], body } };
}

// `words` once, and again after a network error only when `look` finds the lost try did not go through.
async function safely(ports: GitHubPorts, words: string[], look: () => Promise<Look>, doing: string): Promise<ProgramAnswer> {
  const answer = await retried(ports, words, look);
  return isNetworkError(answer)
    ? { ok: false, output: `${answer.output}\n\nlost gh's answer for ${RETRY_MINUTES} minutes ${doing}; look before running it again` }
    : answer;
}

// One read of the pull request: its answer, or unknown when that was lost too.
async function readPullRequest(ports: GitHubPorts, words: string[], done: (output: string) => string | undefined): Promise<Look> {
  const answer = await ports.gh(words);
  if (isNetworkError(answer)) return 'unknown';
  const line = answer.ok ? done(answer.output.trim()) : undefined;
  return line === undefined ? 'not done' : { done: line };
}

// The value of a flag of gh pr create's, as `--head x`, `-H x` or `--head=x`.
function flagValue(words: readonly string[], long: string, short: string): string | undefined {
  const at = words.findIndex((word) => word === long || word === short);
  return at === -1 ? words.find((word) => word.startsWith(`${long}=`))?.slice(long.length + 1) : words[at + 1];
}

// The open pull request, by its url, of the branch gh pr create opens one for: its --head, in its
// --repo, else the folder's branch.
function branchOpenPullRequest(ports: GitHubPorts, createWords: readonly string[]) {
  const head = flagValue(createWords, '--head', '-H');
  const repository = flagValue(createWords, '--repo', '-R');
  const target = [...(head === undefined ? [] : [head]), ...(repository === undefined ? [] : ['--repo', repository])];
  return readPullRequest(ports, ['pr', 'view', ...target, '--json', 'state,url', '-q', 'select(.state == "OPEN") | .url'],
    (url) => url === '' ? undefined : `${url}\nalready open for this branch`);
}

const readiness = (ports: GitHubPorts, target: string, undo: boolean) => readPullRequest(ports, ['pr', 'view', target, '--json', 'isDraft', '-q', '.isDraft'],
  (draft) => draft === String(undo) ? `${target} is ${undo ? 'a draft' : 'ready for review'}` : undefined);

// Whether one of the comments made since the post was asked (the `before`th on) has its body: an
// earlier comment with the same words, or someone else's after it, says nothing about this post.
const postedSince = (ports: GitHubPorts, target: string, body: string, before: string) => readPullRequest(ports, ['pr', 'view', target, '--json', 'comments', '-q', `.comments[${before}:] | map(.body)`],
  (bodies) => {
    const posted: unknown = JSON.parse(bodies || '[]');
    return Array.isArray(posted) && posted.some((each) => typeof each === 'string' && each.trim() === body.trim()) ? `commented on ${target}` : undefined;
  });

export async function writePullRequest(ports: GitHubPorts, command: WriteCommand): Promise<ProgramAnswer> {
  if (command.verb === 'create') {
    const before = await branchOpenPullRequest(ports, command.words);
    if (typeof before === 'object') return { ok: true, output: before.done };
    return safely(ports, ['pr', 'create', ...command.words], () => branchOpenPullRequest(ports, command.words), 'opening the pull request');
  }
  if (command.verb === 'ready') {
    const { target, undo } = command;
    const before = await readiness(ports, target, undo);
    if (typeof before === 'object') return { ok: true, output: `${before.done} already` };
    return safely(ports, ['pr', 'ready', target, ...(undo ? ['--undo'] : [])], () => readiness(ports, target, undo), `marking ${target}`);
  }
  // Not looked for first: the same words posted twice on purpose, a round apart, are two comments. The
  // count before is what tells this post from an earlier one with the same words.
  const { target, body } = command;
  const count = await retried(ports, ['pr', 'view', target, '--json', 'comments', '-q', '.comments | length']);
  if (isNetworkError(count)) return { ok: false, output: `${count.output}\n\nlost gh's answer for ${RETRY_MINUTES} minutes reading ${target}'s comments; nothing is posted, run it again` };
  if (!count.ok) return count;
  const before = count.output.trim();
  return safely(ports, ['pr', 'comment', target, '--body', body], () => postedSince(ports, target, body, before), `commenting on ${target}`);
}
