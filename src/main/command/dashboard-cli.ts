// The `dashboard` command's first word: which program the rest of the words go to. One command,
// `dashboard <noun> <verb> ...`, so an agent learns one entry and one env var, DASHBOARD_COMMAND.
//
// Each noun owns its verbs. The program a noun names parses everything after it, exactly as it did
// when it was a command of its own, so `dashboard board move <id> Done` and `node "$DASHBOARD_BOARD"
// move <id> Done` are one parser and cannot drift apart. A new noun is a row in NOUNS, a line in
// DASHBOARD_USAGE and a branch in the entry; a new verb belongs to its noun's own parser, never here.
//
// `session` is the old name of `pane`, kept so a skill written against the session command reads
// the same with `dashboard` in front of it.

export type Noun = 'board' | 'pane';

const NOUNS = new Map<string, Noun>([
  ['board', 'board'],
  ['pane', 'pane'],
  ['session', 'pane'],
]);

export const DASHBOARD_USAGE = `dashboard — the Dashboard app, from a shell in any of its panes

  dashboard board <command>   the board of the project you are in
  dashboard pane <command>    the project's worker panes

Run a noun with no command to see what it takes. \`session\` is another name for \`pane\`.`;

export type Route = { ok: true; noun: Noun; commandArguments: string[] } | { ok: false; message: string };

export function routeDashboardCommand(commandArguments: readonly string[]): Route {
  const [word, ...rest] = commandArguments;
  if (word === undefined) return { ok: false, message: DASHBOARD_USAGE };
  const noun = NOUNS.get(word);
  if (noun === undefined) return { ok: false, message: `no such noun: ${word}\n\n${DASHBOARD_USAGE}` };
  return { ok: true, noun, commandArguments: rest };
}
