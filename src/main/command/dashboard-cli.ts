import { USAGE as BOARD_USAGE } from '../board/board-usage';
import { PROJECT_USAGE } from '../projects/project-cli';
import { SESSION_USAGE } from '../workers/session-cli';

// The `dashboard` command's first word: which program the rest of the words go to, or whether they are
// the app's own. One command, `dashboard <noun> <verb> ...`, run from any terminal through the launcher
// rebuild.sh installs, or as `node "$DASHBOARD_COMMAND"` in a pane.
//
// Each noun owns its verbs. The program a noun names parses everything after it, exactly as it did
// when it was a command of its own, so `dashboard board move <id> Done` and `node "$DASHBOARD_BOARD"
// move <id> Done` are one parser and cannot drift apart. A new noun is a row in NOUNS, a line in
// DASHBOARD_USAGE, a row in NOUN_HELP and a branch in the entry; a new verb belongs to its noun's own
// parser, never here.
//
// `session` is the old name of `pane`, kept so a skill written against the session command reads
// the same with `dashboard` in front of it.

export type Noun = 'board' | 'pane' | 'project';

const NOUNS = new Map<string, Noun>([
  ['board', 'board'],
  ['pane', 'pane'],
  ['session', 'pane'],
  ['project', 'project'],
]);

export const DASHBOARD_USAGE = `dashboard — drive the Dashboard app from any terminal

Dashboard is a desktop app with one page per project: a main Claude session, the worker panes it
dispatches into, an editor and a kanban board kept in the project's .dashboard/board folder.

  dashboard                     open the app, or bring it to the front
  dashboard board <command>     read and change a project's board
  dashboard pane <command>      claim a worker pane, start Claude in it, type into it, release it
  dashboard project <command>   list, open, close and switch to the projects in ~/.dashboard/projects.yaml
  dashboard <noun> --help       what a noun takes

pane, board ship and review, a board move into Ship or Review, and project open, close and focus
need the running app and start it when none answers; every other board verb and move, and project
list, find and init, work on files alone. Outside a pane the command does not know which project you
mean: board uses the folder you are in, or --project <name>; pane claim needs --project.`;

const NOUN_HELP: Record<Noun, string> = {
  board: `dashboard board — the kanban board of a project, kept in its .dashboard/board folder

The board of the folder you are in, or of the git repository it is in; --project <name|aka> names one
from ~/.dashboard/projects.yaml instead. The app redraws it as soon as its files change. The words
after \`board\` are these:

${BOARD_USAGE}`,
  pane: `dashboard pane — the terminal panes of a project open in the app

A pane id is <page>:<pane>, as claim and list print it. Outside a pane, claim needs --project to say
which project; run, send and release take the id claim printed. The words after \`pane\` are these:

${SESSION_USAGE}`,
  project: `dashboard project — the projects in ~/.dashboard/projects.yaml, by name

list marks the ones the app had open when it last saved. open, close and focus need the running app.
The words after \`project\` are these:

${PROJECT_USAGE}`,
};

const HELP = new Set(['--help', '-h', 'help']);

// `app` is the app's own command line: none, or flags such as --remote, which the app reads at launch
// and a running app reads from a second launch (launch-gate.ts).
export type Route =
  | { kind: 'program'; noun: Noun; commandArguments: string[] }
  | { kind: 'help'; text: string }
  | { kind: 'app'; appArguments: string[] }
  | { kind: 'refused'; message: string };

export function routeDashboardCommand(commandArguments: readonly string[]): Route {
  const [word, ...rest] = commandArguments;
  if (word === undefined) return { kind: 'app', appArguments: [] };
  if (HELP.has(word)) return { kind: 'help', text: DASHBOARD_USAGE };
  if (word.startsWith('--')) return { kind: 'app', appArguments: [...commandArguments] };
  const noun = NOUNS.get(word);
  if (noun === undefined) return { kind: 'refused', message: `no such noun: ${word}\n\n${DASHBOARD_USAGE}` };
  if (rest.length === 1 && HELP.has(rest[0])) return { kind: 'help', text: NOUN_HELP[noun] };
  return { kind: 'program', noun, commandArguments: rest };
}
