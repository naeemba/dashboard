import type { Channels } from '../app/channels';
import { isRecord } from '../../shared/app/is-record';
import type { Refused } from '../../shared/app/bridge';
import type { MoveSource } from '../../shared/board/column-entry';
import { BOARD_REQUEST } from '../board/board-cli';
import { answered, refused, type SessionReply, type SessionRequest } from '../workers/session-cli';

// What an action is, and the one place each is bound to its two doors: an IPC channel for the screen
// and a verb of `dashboard board` for the command. docs/actions/README.md says why actions live in main
// and why the wiring is written once here rather than beside each door.
//
// An action is named `<noun>.<verb>`. Its channel is `<noun>:<verb>` (app-rule-1) and its command is
// `dashboard board <verb> <id> ...`, the words after the verb named in `words`, in order.

export type Action<Ports, Input, Result extends { output: string }> = {
  name: string;
  // The command's positional words after the project folder, read into the input under these names.
  words: readonly string[];
  // The command's flags, anywhere after the folder: a switch reads as true, a value as the word after it.
  flags?: Readonly<Record<string, 'switch' | 'value'>>;
  // The one check of what came in, at the edge, whichever door it came through. `source` is set by
  // the door, never by the caller: the screen is always 'user' and the command always 'command'.
  input(raw: Record<string, unknown>): Input | Refused;
  run(ports: Ports, input: Input): Promise<Result | Refused>;
};

export function action<Ports, Input, Result extends { output: string }>(
  name: string,
  spec: Omit<Action<Ports, Input, Result>, 'name'>,
): Action<Ports, Input, Result> {
  return { name, ...spec };
}

// An action with its ports, as main hands it to the doors.
export type BoundAction<Result extends { output: string } = { output: string }> = {
  name: string;
  words: readonly string[];
  flags?: Action<unknown, unknown, Result>['flags'];
  call(raw: Record<string, unknown>): Promise<Result | Refused>;
};

export function bind<Ports, Input, Result extends { output: string }>(
  definition: Action<Ports, Input, Result>,
  ports: NoInfer<Ports>,
): BoundAction<Result> {
  return {
    name: definition.name,
    words: definition.words,
    flags: definition.flags,
    // Nothing is awaited before `run` starts, so everything a run does before its own first await is
    // done when `call` returns. pane.dispatch and pane.restore are written to it: a restart goes on to
    // start the mains its workers report to off what they set. So is browser.open's popup: the view
    // it makes takes the window the page opened (browser-views.ts). An await here breaks both.
    async call(raw) {
      const input = definition.input(raw);
      if (isRefused(input)) return input;
      return definition.run(ports, input);
    },
  };
}

export function isRefused(value: unknown): value is Refused {
  return isRecord(value) && typeof value.refused === 'string';
}

// An action's answer as the session socket carries it.
export function sessionReply(result: { output: string } | Refused): SessionReply {
  return isRefused(result) ? refused(result.refused) : answered(result.output);
}

export function channelOf(name: string): string {
  return name.replace('.', ':');
}

export function verbOf(name: string): string {
  return name.slice(name.indexOf('.') + 1);
}

function withSource(raw: unknown, source: MoveSource): Record<string, unknown> {
  return { ...(isRecord(raw) ? raw : {}), source };
}

// The screen's door: one channel per action, answering the result or `{ refused }` (errors-rule-2).
export function registerActions(table: Channels, actions: readonly BoundAction[]): void {
  for (const bound of actions) {
    table.handle(channelOf(bound.name), (_screen, raw: unknown) => bound.call(withSource(raw, 'user')), bound.name);
  }
}

function usage(verb: string, bound: BoundAction): string {
  const flags = Object.entries(bound.flags ?? {}).map(([name, takes]) => (takes === 'switch' ? ` [--${name}]` : ` [--${name} <${name}>]`));
  return `usage: board ${verb} ${bound.words.map((name) => `<${name}>`).join(' ')}${flags.join('')}`;
}

// The words after the folder, the action's flags taken out. A word that is no flag of its is a
// positional one, so a stray flag fails the count and is answered with the usage.
function readFlags(words: readonly string[], flags: NonNullable<BoundAction['flags']>): { positional: string[]; flagged: Record<string, unknown> } {
  const positional: string[] = [];
  const flagged: Record<string, unknown> = {};
  for (let at = 0; at < words.length; at++) {
    const name = words[at].startsWith('--') ? words[at].slice(2) : '';
    const takes = Object.hasOwn(flags, name) ? flags[name] : undefined;
    if (takes === undefined) positional.push(words[at]);
    else flagged[name] = takes === 'switch' ? true : words[++at];
  }
  return { positional, flagged };
}

// The command's door, on the session socket: [BOARD_REQUEST, verb, folder, ...words], the folder
// already resolved by the command the way every other board verb resolves it. Anything else is
// `otherwise`'s.
export function actionRequests(
  actions: readonly BoundAction[],
  otherwise: (request: SessionRequest) => Promise<SessionReply>,
): (request: SessionRequest) => Promise<SessionReply> {
  return async (request) => {
    const [word, verb, folder, ...rest] = request.args;
    if (word !== BOARD_REQUEST) return otherwise(request);
    const bound = actions.find((each) => verbOf(each.name) === verb);
    if (bound === undefined || folder === undefined) {
      return refused('the board request was not one the app could read');
    }
    const { positional, flagged } = readFlags(rest, bound.flags ?? {});
    if (positional.length !== bound.words.length) return refused(usage(verb, bound));
    const raw = { projectPath: folder, ...flagged, ...Object.fromEntries(bound.words.map((name, index) => [name, positional[index]])) };
    const result = await bound.call(withSource(raw, 'command'));
    return sessionReply(result);
  };
}
