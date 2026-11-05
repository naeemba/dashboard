// The `session` command's words: what it takes and what each spelling means. Read by the command itself,
// so a typo is answered without the app, and by main, which answers the rest. One parser, because the
// command and the app it talks to are built from the same tree and must not disagree on a spelling.

import type { WorkerState } from '../../shared/app/bridge';
import type { StopWaiting } from '../../shared/workers/worker-roster';
import { isRecord } from '../../shared/app/is-record';

export type SessionCommand =
  | { kind: 'claim'; project: string | null }
  // `screen` runs the worker as a Claude screen in the pane rather than Claude Code in its terminal.
  | { kind: 'run'; id: string; prompt: string; card: string | null; worktree: boolean; screen: boolean }
  | { kind: 'list'; all: boolean }
  | { kind: 'send'; id: string; text: string }
  | { kind: 'release'; id: string }
  // `waiting` is what a Stop hook said its session waits on, when it said so.
  | { kind: 'notify'; id: string; state: WorkerState; waiting?: StopWaiting };

// What goes over the socket and what comes back. The folder is where the command was run, which is how
// main tells which project is asking; a worker's hook runs in its worktree and is found the same way.
// version is the command's build stamp, which the app refuses unless it is its own: app-handshake.ts.
export type SessionRequest = { directory: string; args: readonly string[]; version?: string };
export type SessionReply = { ok: boolean; output: string };

export const SESSION_USAGE = `session — the Dashboard panes of the project you are in

  session claim [--project <name|aka>]
  session run <id> [--card <card id> | --worktree] [--screen] "<prompt>"
  session list [--all]
  session send <id> "<text>"
  session release <id>
  session notify <id> running|blocked|done [--stop-input]

claim opens a worker pane and prints its id: --project opens it on the page of the project
~/.dashboard/projects.yaml calls that, opening the project first if it is closed. run starts Claude
in it with the prompt as its argument: --card runs it in the worktree the card was shipped into,
--worktree in a throwaway one that release removes once its work is pushed with a pull request open,
and neither in the project itself; --screen runs it as a Claude screen in the pane instead of a terminal. send types the text into the pane and presses Enter. notify is
what a worker's hooks call: --stop-input reads Claude Code's Stop hook input for how many background
tasks and wakeups the session still waits on. list --all lists the panes of every open project and the manager.`;

type Parsed = { ok: true; command: SessionCommand } | { ok: false; message: string };

// A terminal id, `<slot>:<pane>`, the one claim prints. The slot may be negative: the manager's
// terminals sit in MANAGER_SLOT, -2. The editor's pane number is negative and is left out here, since
// nothing this command does belongs in it.
const PANE_ID = /^-?\d+:\d+$/;

function refuse(message: string): Parsed {
  return { ok: false, message };
}

function paneId(word: string | undefined, command: string): string | Parsed {
  if (word === undefined) return refuse(`session ${command} needs a pane id, the one claim printed`);
  return PANE_ID.test(word) ? word : refuse(`${word} is not a pane id — claim prints one, like 2:3`);
}

function parseRun(words: readonly string[]): Parsed {
  const id = paneId(words[0], 'run');
  if (typeof id !== 'string') return id;
  let card: string | null = null;
  let worktree = false;
  let screen = false;
  const prompt: string[] = [];
  for (let at = 1; at < words.length; at++) {
    if (words[at] === '--worktree') worktree = true;
    else if (words[at] === '--screen') screen = true;
    else if (words[at] === '--card') {
      card = words[++at] ?? '';
      if (card === '') return refuse('--card needs the card id, the one `board list` prints');
    } else prompt.push(words[at]);
  }
  if (card !== null && worktree) return refuse('a task runs in its card\'s worktree or a throwaway one, not both');
  if (prompt.join(' ').trim() === '') return refuse('session run needs a prompt for the worker');
  return { ok: true, command: { kind: 'run', id, prompt: prompt.join(' '), card, worktree, screen } };
}

const COUNT = /^\d+$/;

// What a done says it waits on. Every word after the state is optional, so a hook of any build is
// still heard: none is a Stop hook that said nothing, which the app gives the grace period.
function parseNotify(id: string, state: WorkerState, words: readonly string[]): Parsed {
  if (words.length === 0) return { ok: true, command: { kind: 'notify', id, state } };
  const [backgroundFlag, background, scheduledFlag, scheduled] = words;
  if (state !== 'done' || words.length !== 4 || backgroundFlag !== '--background' || scheduledFlag !== '--scheduled'
    || !COUNT.test(background) || !COUNT.test(scheduled)) {
    return refuse('session notify takes nothing after its state, except --stop-input after done');
  }
  return { ok: true, command: { kind: 'notify', id, state, waiting: { background: Number(background), scheduled: Number(scheduled) } } };
}

// `notify <id> done --stop-input` is a Stop hook asking the command to read its input on stdin, which
// session-program.ts does before parsing: the app is sent the counts, never the flag or the input.
export function readsStopInput(commandArguments: readonly string[]): boolean {
  return commandArguments.length === 4 && commandArguments[0] === 'notify' && commandArguments[2] === 'done'
    && commandArguments[3] === '--stop-input';
}

// A Stop hook's input, read for what the session still waits on: the arguments the app is sent in
// place of --stop-input. None when the input is not JSON or lacks either list — an older Claude Code
// — so the app falls back to its grace period.
export function stopInputArguments(input: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return [];
  }
  const waiting = stopWaiting(parsed);
  return waiting === undefined ? [] : ['--background', String(waiting.background), '--scheduled', String(waiting.scheduled)];
}

// What a Stop hook's input says its session still waits on, or undefined when it lacks either list.
// A Claude screen's Stop hook is handed the input as an object (screen-workers.ts).
export function stopWaiting(input: unknown): StopWaiting | undefined {
  if (!isRecord(input)) return undefined;
  const { background_tasks: background, session_crons: scheduled } = input;
  if (!Array.isArray(background) || !Array.isArray(scheduled)) return undefined;
  return { background: background.length, scheduled: scheduled.length };
}

// The arguments the app is sent for what was typed, with the Stop hook's input read from stdin when
// it asked for that: `input` is undefined when there was none to read, a terminal, which sends no counts.
export function stopHookArguments(given: readonly string[], input: string | undefined): string[] {
  if (!readsStopInput(given)) return [...given];
  return [...given.slice(0, 3), ...(input === undefined ? [] : stopInputArguments(input))];
}

export function parseSessionCommand(commandArguments: readonly string[]): Parsed {
  const [verb, ...rest] = commandArguments;
  switch (verb) {
    case 'claim': {
      if (rest.length === 0) return { ok: true, command: { kind: 'claim', project: null } };
      const project = rest.slice(1).join(' ').trim();
      if (rest[0] !== '--project' || project === '') return refuse('session claim takes nothing, or --project and a project\'s name or aka');
      return { ok: true, command: { kind: 'claim', project } };
    }
    case 'list': {
      if (rest.length === 0) return { ok: true, command: { kind: 'list', all: false } };
      if (rest.length === 1 && rest[0] === '--all') return { ok: true, command: { kind: 'list', all: true } };
      return refuse('session list takes nothing, or --all');
    }
    case 'run': return parseRun(rest);
    case 'send': {
      const id = paneId(rest[0], 'send');
      if (typeof id !== 'string') return id;
      const text = rest.slice(1).join(' ');
      if (text.trim() === '') return refuse('session send needs the text to type');
      return { ok: true, command: { kind: 'send', id, text } };
    }
    case 'release': {
      const id = paneId(rest[0], 'release');
      return typeof id === 'string' ? { ok: true, command: { kind: 'release', id } } : id;
    }
    case 'notify': {
      const id = paneId(rest[0], 'notify');
      if (typeof id !== 'string') return id;
      const state = rest[1];
      if (state !== 'running' && state !== 'blocked' && state !== 'done') {
        return refuse('session notify takes running, blocked or done');
      }
      return parseNotify(id, state, rest.slice(2));
    }
    default: return refuse(verb === undefined ? SESSION_USAGE : `no such command: ${verb}\n\n${SESSION_USAGE}`);
  }
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
  if (command.kind === 'claim' && !namesItsTarget(command)) {
    return 'outside a Dashboard pane, claim needs --project <name|aka> to say which project the worker is for';
  }
  return null;
}
