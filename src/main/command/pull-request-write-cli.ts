// `pr create`, `pr ready` and `pr comment`: the gh calls that change a pull request, tried again on a
// GitHub 5xx or lost answer only once GitHub says the lost try did not go through. A worker retrying
// `gh pr create` by hand after a 502 met `a pull request already exists`, since the 502 had opened it.

import { type GitHubPorts, isNetworkError, type ProgramAnswer, RETRY_MINUTES, RETRY_WAITS_MS } from './gh-answer';

export const WRITE_LINES = `  pr create <gh pr create's flags> [--project <name|aka>]
  pr ready <number|url|branch> [--undo] [--project <name|aka>]
  pr comment <number|url|branch> --body <text> [--project <name|aka>]`;

export const WRITE_HELP = `create, ready and comment are gh's, made safe to run again: create prints the branch's open
pull request when it has one, and ready says when it is ready already (a draft already, with
--undo). On a network error or a 5xx from GitHub each looks at the pull request before trying again,
for about four minutes, so a lost answer never opens a second pull request or posts a comment twice.`;

export type WriteVerb = 'create' | 'ready' | 'comment';
export const isWriteVerb = (verb: string): verb is WriteVerb => verb === 'create' || verb === 'ready' || verb === 'comment';
export type WriteCommand =
  | { verb: 'create'; words: string[] }
  | { verb: 'ready'; target: string; undo: boolean }
  | { verb: 'comment'; target: string; body: string };
type Parsed = { ok: true; write: WriteCommand } | { ok: false; message: string };

export function parseWriteCommand(verb: WriteVerb, words: readonly string[]): Parsed {
  if (verb === 'create') return { ok: true, write: { verb, words: [...words] } };
  if (verb === 'ready') {
    const undo = words.includes('--undo');
    const targets = words.filter((word) => word !== '--undo');
    if (targets.length !== 1 || targets[0].startsWith('-')) return { ok: false, message: 'pr ready takes one pull request, and --undo to make it a draft' };
    return { ok: true, write: { verb, target: targets[0], undo } };
  }
  const at = words.findIndex((word) => word === '--body' || word === '-b');
  const body = at === -1 ? undefined : words[at + 1];
  const targets = words.filter((_, index) => at === -1 || (index !== at && index !== at + 1));
  if (body === undefined || targets.length !== 1 || targets[0].startsWith('-')) return { ok: false, message: 'pr comment takes one pull request and --body <text>' };
  return { ok: true, write: { verb, target: targets[0], body } };
}

// What GitHub says after a lost try: done, with the line to print; not done, so try again; or unknown,
// a read lost too, so wait another round rather than act twice.
type Look = { done: string } | 'not done' | 'unknown';

// `words` once, and again after a network error only when `look` finds the lost try did not go through.
async function safely(ports: GitHubPorts, words: string[], look: () => Promise<Look>, doing: string): Promise<ProgramAnswer> {
  let answer = await ports.gh(words);
  for (const milliseconds of RETRY_WAITS_MS) {
    if (!isNetworkError(answer)) return answer;
    await ports.wait(milliseconds);
    const looked = await look();
    if (typeof looked === 'object') return { ok: true, output: looked.done };
    if (looked === 'not done') answer = await ports.gh(words);
  }
  return isNetworkError(answer)
    ? { ok: false, output: `${answer.output}\n\nlost gh's answer for ${RETRY_MINUTES} minutes ${doing}; look before running it again` }
    : answer;
}

// One read of the pull request: its answer, or unknown when that was lost too.
async function read(ports: GitHubPorts, words: string[], done: (output: string) => string | undefined): Promise<Look> {
  const answer = await ports.gh(words);
  if (isNetworkError(answer)) return 'unknown';
  const line = answer.ok ? done(answer.output.trim()) : undefined;
  return line === undefined ? 'not done' : { done: line };
}

// The open pull request of the branch gh pr create opens one for, by its url.
const openOne = (ports: GitHubPorts) => read(ports, ['pr', 'view', '--json', 'state,url', '-q', 'select(.state == "OPEN") | .url'],
  (url) => url === '' ? undefined : `${url}\nalready open for this branch`);

const readiness = (ports: GitHubPorts, target: string, undo: boolean) => read(ports, ['pr', 'view', target, '--json', 'isDraft', '-q', '.isDraft'],
  (draft) => draft === String(undo) ? `${target} is ${undo ? 'a draft' : 'ready for review'}` : undefined);

const lastComment = (ports: GitHubPorts, target: string, body: string) => read(ports, ['pr', 'view', target, '--json', 'comments', '-q', '.comments[-1].body // ""'],
  (last) => last === body.trim() ? `commented on ${target}` : undefined);

export async function writePullRequest(ports: GitHubPorts, command: WriteCommand): Promise<ProgramAnswer> {
  if (command.verb === 'create') {
    const before = await openOne(ports);
    if (typeof before === 'object') return { ok: true, output: before.done };
    return safely(ports, ['pr', 'create', ...command.words], () => openOne(ports), 'opening the pull request');
  }
  if (command.verb === 'ready') {
    const { target, undo } = command;
    const before = await readiness(ports, target, undo);
    if (typeof before === 'object') return { ok: true, output: `${before.done} already` };
    return safely(ports, ['pr', 'ready', target, ...(undo ? ['--undo'] : [])], () => readiness(ports, target, undo), `marking ${target}`);
  }
  // Not looked at first: the same words posted twice on purpose, a round apart, are two comments.
  const { target, body } = command;
  return safely(ports, ['pr', 'comment', target, '--body', body], () => lastComment(ports, target, body), `commenting on ${target}`);
}
