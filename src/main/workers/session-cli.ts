// The `session` command's words: what it takes and what each spelling means. Read by the command itself,
// so a typo is answered without the app, and by main, which answers the rest. One parser, because the
// command and the app it talks to are built from the same tree and must not disagree on a spelling.

import type { WorkerState } from '../../shared/app/bridge';
import type { StopWaiting } from '../../shared/workers/worker-roster';
import { isRecord } from '../../shared/app/is-record';
import type { PaneKind } from '../../shared/panes/pane-kind';
import { asksForReport, LAST_MESSAGE_KEPT, tail } from '../../shared/workers/done-report';

export type SessionCommand =
  | { kind: 'claim'; project: string | null }
  // `as` is --screen or --terminal, or null for neither: pane.dispatch picks then (workers-decision-5).
  // `folder` is --in's, as typed: the app resolves it from the folder the command ran in.
  | { kind: 'run'; id: string } & RunWords
  // run's words with no pane: the pool claims one when the start comes (actions/pane/queue.ts). `first`
  // puts it at the head of the queue, `after` holds it until that card is Done or Cancelled.
  | { kind: 'start'; project: string | null; first: boolean; after: string | null } & RunWords
  | { kind: 'queue' }
  | { kind: 'unqueue'; id: string }
  // `reports` adds the end of each worker's last message to its line, so main reads them all in one call.
  | { kind: 'list'; all: boolean; reports: boolean }
  | { kind: 'send'; id: string; text: string }
  | { kind: 'release'; id: string }
  // release, refused until the worker's card is Done or Cancelled or its branch's pull request merged.
  | { kind: 'finish'; id: string }
  | { kind: 'report'; id: string }
  // Each pane with its card, branch, pull request, CI and last message, then the open pull requests no
  // pane holds: what main rebuilds its state from after a compaction (status-lines.ts).
  | { kind: 'status' }
  // What `pr land` and a board move into Done or Cancelled ask once the work is in: the worker on that
  // branch, or in that card's worktree, released unless something keeps it (auto-release.ts). `from`
  // is the pane the command ran in, never released by its own command: a review pane's own land, or a
  // worker moving its own card, is still mid-turn waiting on the answer.
  | { kind: 'landed'; by: 'branch' | 'card'; name: string; from: string | null }
  // What `pr land` asks when the pull request conflicts with its base: the agent on that branch sent
  // /pr-conflicts, never the pane `from` names, which is the land itself.
  | { kind: 'conflicted'; branch: string; pullRequest: string; from: string | null }
  // `waiting` is what a Stop hook said its session waits on, when it said so; `told` the rest a hook's
  // input said.
  | { kind: 'notify'; id: string; state: WorkerState; waiting?: StopWaiting; told?: HookTold };

export type RunWords = { prompt: string; card: string | null; worktree: boolean; folder: string | null; as: PaneKind | null };

// What a worker's hooks say beside its state: a Stop hook its last message, a prompt hook who put the
// prompt in (UserPromptSubmit's `source`) and whether the prompt is one main handed the worker, ending
// with the line asking for a report (both read by prompt-source.ts). Each is left out by a Claude Code
// too old to send it.
export type HookTold = { lastMessage?: string; promptSource?: string; handed?: boolean };

// What goes over the socket and what comes back. The folder is where the command was run, which is how
// main tells which project is asking; a worker's hook runs in its worktree and is found the same way.
// version is the command's build stamp, which the app refuses unless it is its own: app-handshake.ts.
export type SessionRequest = { directory: string; args: readonly string[]; version?: string };
export type SessionReply = { ok: boolean; output: string };

export const answered = (output: string): SessionReply => ({ ok: true, output });
export const refused = (output: string): SessionReply => ({ ok: false, output });

export const SESSION_USAGE = `pane — the Dashboard panes of the project you are in

  pane start [--project <name|aka>] [--card <card id> | --worktree | --in <folder>] [--terminal]
             [--first] [--after <card id>] "<prompt>"
  pane queue
  pane unqueue <queue id>
  pane claim [--project <name|aka>]
  pane run <id> [--card <card id> | --worktree | --in <folder>] [--terminal] "<prompt>"
  pane list [--all] [--reports]
  pane send <id> "<text>"
  pane release <id>
  pane finish <id>
  pane report <id>
  pane status
  pane landed --branch <branch> | --card <card id> [--from <id>]
  pane conflicted <branch> <pull request> [--from <id>]
  pane notify <id> running|blocked|done [--prompt-input | --stop-input]

start starts a worker now when fewer than the cap (settings workers.cap, 4) are running and nothing
is queued, answering as run does, or queues it and answers \`queued <queue id>, <position>\`; its main
is told when a queued one starts. Its pane is claimed, as claim --project would, when it starts, and
its other words are run's. --first puts it at the head of the queue; --after holds it, letting later
ones go ahead, until that card is Done or Cancelled. The queue also holds while the 7-day usage is at
or over the budget limit. queue lists what is queued, in order, and why it is held; unqueue
withdraws one. A worker running, blocked on a question or paused on its own background work holds
its place; done frees it.
claim opens a worker pane and prints its id: --project opens it on the page of the project
~/.dashboard/projects.yaml calls that, opening the project first if it is closed. run starts Claude
in it with the prompt as its argument, refused at the cap: --card runs it in the worktree the card was shipped into,
--worktree in a throwaway one removed when its pane goes, unless it holds work not on a remote
(run answers once the project's packages are installed there, which can take minutes: give it a
ten-minute timeout, 600000 ms),
--in in a folder that is already there, inside the project or a worktree of its repository (one on
a branch you keep yourself), which nothing makes or removes, and none of them in the project itself.
The worker is a Claude screen; --terminal runs Claude Code in the
pane's terminal. On Windows the terminal is the default, since a screen's turn there ends with the
app, and --screen asks for a screen. send types the text into the pane and presses Enter, or hands
it to a Claude screen as its next prompt. finish releases a worker whose work is in: its card is
Done or Cancelled, or the branch of the worktree it is in has a merged pull request; it refuses
otherwise. report prints the pane's line from list and the last
message its worker ended a turn with. status prints each pane's line with its card, branch, open
pull request and CI state and the end of its last message, then the open pull requests no pane
holds, in one call: the one to make after a compaction.
landed is what pr land runs once it merged, and a board
move into Done or Cancelled: it releases the worker on that branch or in that card's worktree,
never the pane --from names, and prints \`released <id>\`, or \`kept <id>: <why>\` for one
something keeps (the keyboard, a question, mid-turn, typed into by you, or no main handed it work).
conflicted is what pr land runs when the pull request conflicts with its base: it sends
/pr-conflicts <pull request> to the first agent on that branch, never the pane --from names, and
prints \`sent /pr-conflicts <pull request> to <id>\`, or nothing when no agent is on it.
notify is what a worker's hooks call: --stop-input reads Claude
Code's Stop hook input for how many background tasks and wakeups the session still waits on and its
last message, --prompt-input the prompt hook's for who put the prompt in. list --all lists the panes
of every open project and the manager; --reports ends each line with the end of the last message
its worker ended a turn with, cut short (report prints it whole). A card is dispatched with \`board ship <id>\`, not here: it
makes the card's worktree, a worker pane and its agent.`;

type Parsed = { ok: true; command: SessionCommand } | { ok: false; message: string };

// A terminal id, `<slot>:<pane>`, the one claim prints. The slot may be negative: the manager's
// terminals sit in MANAGER_SLOT, -2. The editor's pane number is negative and is left out here, since
// nothing this command does belongs in it.
export const PANE_ID = /^-?\d+:\d+$/;

function refuse(message: string): Parsed {
  return { ok: false, message };
}

function paneId(word: string | undefined, command: string): string | Parsed {
  if (word === undefined) return refuse(`pane ${command} needs a pane id, the one claim printed`);
  return PANE_ID.test(word) ? word : refuse(`${word} is not a pane id — claim prints one, like 2:3`);
}

// run's words after its id, and start's: start also takes --project, --first and --after.
function parseRunWords(words: readonly string[], verb: 'run' | 'start'): { run: RunWords; project: string | null; first: boolean; after: string | null } | Parsed {
  let card: string | null = null;
  let worktree = false;
  let folder: string | null = null;
  let as: PaneKind | null = null;
  let project: string | null = null;
  let first = false;
  let after: string | null = null;
  const prompt: string[] = [];
  for (let at = 0; at < words.length; at++) {
    const word = words[at];
    if (word === '--worktree') worktree = true;
    else if (word === '--screen' || word === '--terminal') {
      const asked = word === '--screen' ? 'screen' : 'terminal';
      if (as !== null && as !== asked) return refuse('a worker runs as a Claude screen or in the terminal, not both');
      as = asked;
    }
    else if (word === '--card') {
      card = words[++at] ?? '';
      if (card === '') return refuse('--card needs the card id, the one `board list` prints');
    } else if (word === '--in') {
      folder = words[++at] ?? '';
      if (folder.trim() === '') return refuse('--in needs the folder the worker runs in');
    } else if (verb === 'start' && word === '--first') first = true;
    else if (verb === 'start' && word === '--project') {
      project = (words[++at] ?? '').trim();
      if (project === '') return refuse('--project needs a project\'s name or aka');
    } else if (verb === 'start' && word === '--after') {
      after = words[++at] ?? '';
      if (after === '') return refuse('--after needs the card id, the one `board list` prints');
    } else prompt.push(word);
  }
  if ([card !== null, worktree, folder !== null].filter(Boolean).length > 1) {
    return refuse('a task runs in its card\'s worktree, a throwaway one or a folder you name with --in, only one of them');
  }
  if (prompt.join(' ').trim() === '') return refuse(`pane ${verb} needs a prompt for the worker`);
  return { run: { prompt: prompt.join(' '), card, worktree, folder, as }, project, first, after };
}

function parseRun(words: readonly string[]): Parsed {
  const id = paneId(words[0], 'run');
  if (typeof id !== 'string') return id;
  const read = parseRunWords(words.slice(1), 'run');
  return 'ok' in read ? read : { ok: true, command: { kind: 'run', id, ...read.run } };
}

function parseStart(words: readonly string[]): Parsed {
  const read = parseRunWords(words, 'start');
  if ('ok' in read) return read;
  const { run, project, first, after } = read;
  return { ok: true, command: { kind: 'start', ...run, project, first, after } };
}

const COUNT = /^\d+$/;

// How every build since the counts opens its refusal of a notify's words, this one's included.
const NOTIFY_WORDS_REFUSED = 'session notify takes nothing after its state';

// The words a notify grew after the counts, which an app from before them refuses.
const LAST_MESSAGE_FLAG = '--last-message';
const PROMPT_SOURCE_FLAG = '--prompt-source';
const HANDED_FLAG = '--handed';
const GROWN_FLAGS = [LAST_MESSAGE_FLAG, PROMPT_SOURCE_FLAG, HANDED_FLAG];

// Whether a refused notify is sent again in an older app's words (session-socket.ts): only when the
// app refused it for its words, not for the pane or for being unreachable, and only when the older
// words differ, or the same refusal comes back twice.
export function retriesInOlderWords(reply: SessionReply, commandArguments: readonly string[], older: readonly string[]): boolean {
  return !reply.ok && older.length !== commandArguments.length && reply.output.startsWith(NOTIFY_WORDS_REFUSED);
}

// What a notify says after its state, as flag and value pairs. Every pair is optional, so a hook of any
// build is still heard: no counts is a Stop hook that said nothing, which the app gives the grace
// period. A flag this build does not know is read past, so a hook that grows one never needs the
// command's retry in an older app's words again, as long as the flag takes a value: an odd number of
// words is refused (workers-decision-4).
function parseNotify(id: string, state: WorkerState, words: readonly string[]): Parsed {
  const flags = new Map<string, string>();
  for (let at = 0; at < words.length; at += 2) flags.set(words[at], words[at + 1] ?? '');
  const background = flags.get('--background');
  const scheduled = flags.get('--scheduled');
  const counts = background !== undefined || scheduled !== undefined;
  if (words.length % 2 !== 0 || (counts && (state !== 'done' || !COUNT.test(background ?? '') || !COUNT.test(scheduled ?? '')))) {
    return refuse(`${NOTIFY_WORDS_REFUSED}, except --prompt-input after running and --stop-input after done`);
  }
  const told: HookTold = {};
  const lastMessage = flags.get(LAST_MESSAGE_FLAG);
  const promptSource = flags.get(PROMPT_SOURCE_FLAG);
  if (lastMessage !== undefined && state === 'done') told.lastMessage = lastMessage;
  if (promptSource !== undefined && state === 'running') told.promptSource = promptSource;
  if (flags.get(HANDED_FLAG) === 'yes' && state === 'running') told.handed = true;
  const command: SessionCommand = { kind: 'notify', id, state };
  if (counts) command.waiting = { background: Number(background), scheduled: Number(scheduled) };
  if (Object.keys(told).length > 0) command.told = told;
  return { ok: true, command };
}

// The flag a hook asking the command to read its input on stdin spells after each state:
// session-program.ts reads it before parsing, and the app is sent what it said, never the flag or the
// input.
const INPUT_FLAG = new Map([['done', '--stop-input'], ['running', '--prompt-input']]);

export function readsHookInput(commandArguments: readonly string[]): boolean {
  return commandArguments.length === 4 && commandArguments[0] === 'notify'
    && INPUT_FLAG.get(commandArguments[2]) === commandArguments[3];
}

function parsedInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

// A Stop hook's input: the arguments the app is sent in place of --stop-input. No counts when the input
// lacks either list, an older Claude Code, so the app falls back to its grace period.
export function stopInputArguments(input: string): string[] {
  const parsed = parsedInput(input);
  const waiting = stopWaiting(parsed);
  const { lastMessage } = hookTold(parsed);
  return [
    ...(waiting === undefined ? [] : ['--background', String(waiting.background), '--scheduled', String(waiting.scheduled)]),
    // Cut here too, so a long final message is not sent whole only for the app to keep its end.
    ...(lastMessage === undefined ? [] : [LAST_MESSAGE_FLAG, tail(lastMessage, LAST_MESSAGE_KEPT)]),
  ];
}

// A prompt hook's input: the arguments the app is sent in place of --prompt-input.
export function promptInputArguments(input: string): string[] {
  const { promptSource, handed } = hookTold(parsedInput(input));
  return [
    ...(promptSource === undefined ? [] : [PROMPT_SOURCE_FLAG, promptSource]),
    ...(handed === true ? [HANDED_FLAG, 'yes'] : []),
  ];
}

// What a Stop hook's input says its session still waits on, or undefined when it lacks either list.
// A Claude screen's hooks are handed the input as an object (screen-workers.ts).
export function stopWaiting(input: unknown): StopWaiting | undefined {
  if (!isRecord(input)) return undefined;
  const { background_tasks: background, session_crons: scheduled } = input;
  if (!Array.isArray(background) || !Array.isArray(scheduled)) return undefined;
  return { background: background.length, scheduled: scheduled.length };
}

// What a Stop or prompt hook's input says beside the counts. Claude Code calls them
// `last_assistant_message`, `source` and `prompt`.
export function hookTold(input: unknown): HookTold {
  if (!isRecord(input)) return {};
  const { last_assistant_message: lastMessage, source: promptSource, prompt } = input;
  return {
    ...(typeof lastMessage === 'string' && lastMessage !== '' && { lastMessage }),
    ...(typeof promptSource === 'string' && { promptSource }),
    ...(typeof prompt === 'string' && asksForReport(prompt) && { handed: true }),
  };
}

// The arguments the app is sent for what was typed, with the hook's input read from stdin when it
// asked for that: `input` is undefined when there was none to read, a terminal, which sends nothing.
export function hookArguments(given: readonly string[], input: string | undefined): string[] {
  if (!readsHookInput(given)) return [...given];
  if (input === undefined) return given.slice(0, 3);
  return [...given.slice(0, 3), ...(given[2] === 'done' ? stopInputArguments(input) : promptInputArguments(input))];
}

// The words an app from before the last message, the prompt source and the handoff takes for the same notify. A
// rebuild swaps the command under an app still running the old build, which refuses those words, and
// the pane would stay `running` with its main never told until the restart (workers-decision-4).
export function olderNotifyArguments(commandArguments: readonly string[]): string[] {
  if (commandArguments[0] !== 'notify') return [...commandArguments];
  const older: string[] = [];
  for (let at = 0; at < commandArguments.length; at++) {
    if (GROWN_FLAGS.includes(commandArguments[at])) at++;
    else older.push(commandArguments[at]);
  }
  return older;
}

export function parseSessionCommand(commandArguments: readonly string[]): Parsed {
  const [verb, ...rest] = commandArguments;
  switch (verb) {
    case 'claim': {
      if (rest.length === 0) return { ok: true, command: { kind: 'claim', project: null } };
      const project = rest.slice(1).join(' ').trim();
      if (rest[0] !== '--project' || project === '') return refuse('pane claim takes nothing, or --project and a project\'s name or aka');
      return { ok: true, command: { kind: 'claim', project } };
    }
    case 'list': {
      const flags = new Set(rest);
      if (flags.size !== rest.length || rest.some((flag) => flag !== '--all' && flag !== '--reports')) return refuse('pane list takes nothing, --all, --reports or both');
      return { ok: true, command: { kind: 'list', all: flags.has('--all'), reports: flags.has('--reports') } };
    }
    case 'status': return rest.length === 0 ? { ok: true, command: { kind: 'status' } } : refuse('pane status takes nothing');
    case 'run': return parseRun(rest);
    case 'start': return parseStart(rest);
    case 'queue': return rest.length === 0 ? { ok: true, command: { kind: 'queue' } } : refuse('pane queue takes nothing');
    case 'unqueue': return rest.length === 1 && rest[0].trim() !== '' ? { ok: true, command: { kind: 'unqueue', id: rest[0] } } : refuse('pane unqueue takes the queue id pane queue prints, like q7');
    case 'send': {
      const id = paneId(rest[0], 'send');
      if (typeof id !== 'string') return id;
      const text = rest.slice(1).join(' ');
      if (text.trim() === '') return refuse('pane send needs the text to type');
      return { ok: true, command: { kind: 'send', id, text } };
    }
    case 'release':
    case 'finish':
    case 'report': {
      const id = paneId(rest[0], verb);
      return typeof id === 'string' ? { ok: true, command: { kind: verb, id } } : id;
    }
    case 'landed': {
      const [flag, name = '', ...more] = rest;
      const from = fromFlag(more);
      if ((flag !== '--branch' && flag !== '--card') || name.trim() === '' || (more.length > 0 && from === null)) {
        return refuse('pane landed takes --branch <branch> or --card <card id>, optionally then --from <id>');
      }
      return { ok: true, command: { kind: 'landed', by: flag === '--branch' ? 'branch' : 'card', name, from } };
    }
    case 'conflicted': {
      const [branch = '', pullRequest = '', ...more] = rest;
      const from = fromFlag(more);
      if (branch.trim() === '' || pullRequest.trim() === '' || (more.length > 0 && from === null)) {
        return refuse('pane conflicted takes <branch> <pull request>, optionally then --from <id>');
      }
      return { ok: true, command: { kind: 'conflicted', branch, pullRequest, from } };
    }
    case 'notify': {
      const id = paneId(rest[0], 'notify');
      if (typeof id !== 'string') return id;
      const state = rest[1];
      if (state !== 'running' && state !== 'blocked' && state !== 'done') {
        return refuse('pane notify takes running, blocked or done');
      }
      return parseNotify(id, state, rest.slice(2));
    }
    default: return refuse(verb === undefined ? SESSION_USAGE : `no such command: ${verb}\n\n${SESSION_USAGE}`);
  }
}

// `--from <id>`, the pane `landed` and `conflicted` are asked from: its id, or null for none or a bad one.
const fromFlag = (words: readonly string[]): string | null => (words.length === 2 && words[0] === '--from' && PANE_ID.test(words[1]) ? words[1] : null);
const fromWords = (from: string | undefined): string[] => (from === undefined ? [] : ['--from', from]);

// The words `pr land` and a board move ask `pane landed` in, from the pane they ran in when there is one.
export function landedWords(by: 'branch' | 'card', name: string, from: string | undefined): string[] {
  return ['landed', `--${by}`, name, ...fromWords(from)];
}

// The words `pr land` asks `pane conflicted` in, as landedWords.
export function conflictedWords(branch: string, pullRequest: string, from: string | undefined): string[] {
  return ['conflicted', branch, pullRequest, ...fromWords(from)];
}

// What they print of the app's answer: its lines, or the first line of why no worker was released. An
// app from before \`pane landed\` refuses it with the whole usage after its first line.
export function landedLine(reply: SessionReply): string {
  return reply.ok ? reply.output : `no worker released: ${reply.output.split('\n')[0]}`;
}

// What `pr land` makes of the app's answer to `pane conflicted`: handed when an agent was sent
// /pr-conflicts (a line naming it), not when no agent is on the branch (''), and the first line of
// why not when the app refused, as an app from before `pane conflicted` does with its usage.
export function conflictedLine(reply: SessionReply): { handed: boolean; line: string } {
  return reply.ok ? { handed: reply.output !== '', line: reply.output } : { handed: false, line: `conflict not handed on: ${reply.output.split('\n')[0]}` };
}

// Whether the words say which project they act on without a folder to go by: a pane id names its own
// project, claim --project and list --all name theirs. The app reads it for a command from a folder in
// no open project (session-requests.ts), and outsidePaneRefusal for one from outside every pane.
export function namesItsTarget(command: SessionCommand): boolean {
  return 'id' in command || (command.kind === 'claim' && command.project !== null) || (command.kind === 'list' && command.all);
}

// Why a command run outside any pane is refused before it reaches the app, or null. A pane knows its
// project and a plain terminal does not, so a claim there has to name one: claiming in whatever
// project the terminal happens to stand in would be a guess.
export function outsidePaneRefusal(command: SessionCommand): string | null {
  // No main's worker is finished from outside every pane, so `pr land` and a board move there ask nothing.
  if (command.kind === 'landed') return 'outside a Dashboard pane, landed has no main whose worker it finished';
  if (command.kind === 'conflicted') return 'outside a Dashboard pane, conflicted has no main whose worker it hands work to';
  if (command.kind === 'claim' && !namesItsTarget(command)) {
    return 'outside a Dashboard pane, claim needs --project <name|aka> to say which project the worker is for';
  }
  return null;
}
