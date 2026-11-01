// The `session` command's words: what it takes and what each spelling means. Read by the command itself,
// so a typo is answered without the app, and by main, which answers the rest. One parser, because the
// command and the app it talks to are built from the same tree and must not disagree on a spelling.

import type { WorkerState } from '../../shared/app/bridge';

export type SessionCommand =
  | { kind: 'claim'; project: string | null }
  | { kind: 'run'; id: string; prompt: string; card: string | null; worktree: boolean }
  | { kind: 'list'; all: boolean }
  | { kind: 'release'; id: string }
  | { kind: 'notify'; id: string; state: WorkerState };

// What goes over the socket and what comes back. The folder is where the command was run, which is how
// main tells which project is asking; a worker's hook runs in its worktree and is found the same way.
export type SessionRequest = { directory: string; args: readonly string[] };
export type SessionReply = { ok: boolean; output: string };

const SESSION_USAGE = `session — the Dashboard panes of the project you are in

  session claim [--project <name|aka>]
  session run <id> [--card <card id> | --worktree] "<prompt>"
  session list [--all]
  session release <id>
  session notify <id> running|blocked|done

claim opens a worker pane and prints its id: --project opens it on the page of the project
~/.dashboard/projects.yaml calls that, opening the project first if it is closed. run starts Claude in it with the prompt as its argument:
--card runs it in the worktree the card was shipped into, --worktree in a throwaway one that release
removes once its work is pushed with a pull request open, and neither in the project itself. notify is
what a worker's hooks call. list --all lists the panes of every open project and the manager.`;

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
  const prompt: string[] = [];
  for (let at = 1; at < words.length; at++) {
    if (words[at] === '--worktree') worktree = true;
    else if (words[at] === '--card') {
      card = words[++at] ?? '';
      if (card === '') return refuse('--card needs the card id, the one `board list` prints');
    } else prompt.push(words[at]);
  }
  if (card !== null && worktree) return refuse('a task runs in its card\'s worktree or a throwaway one, not both');
  if (prompt.join(' ').trim() === '') return refuse('session run needs a prompt for the worker');
  return { ok: true, command: { kind: 'run', id, prompt: prompt.join(' '), card, worktree } };
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
      if (rest.length === 0 || (rest.length === 1 && rest[0] === '--all')) return { ok: true, command: { kind: 'list', all: rest.length === 1 } };
      return refuse('session list takes nothing, or --all');
    }
    case 'run': return parseRun(rest);
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
      return { ok: true, command: { kind: 'notify', id, state } };
    }
    default: return refuse(verb === undefined ? SESSION_USAGE : `no such command: ${verb}\n\n${SESSION_USAGE}`);
  }
}
