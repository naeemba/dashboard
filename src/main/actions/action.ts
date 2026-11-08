import type { Channels } from '../app/channels';
import { isRecord } from '../../shared/app/is-record';
import type { Refused } from '../../shared/app/bridge';
import type { MoveSource } from '../../shared/board/column-entry';
import { BOARD_REQUEST } from '../board/board-cli';
import type { SessionReply, SessionRequest } from '../workers/session-cli';

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
  call(raw: Record<string, unknown>): Promise<Result | Refused>;
};

export function bind<Ports, Input, Result extends { output: string }>(
  definition: Action<Ports, Input, Result>,
  ports: Ports,
): BoundAction<Result> {
  return {
    name: definition.name,
    words: definition.words,
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
  return isRefused(result) ? { ok: false, output: result.refused } : { ok: true, output: result.output };
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
    table.handle(channelOf(bound.name), (_screen, raw: unknown) => bound.call(withSource(raw, 'user')));
  }
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
      return { ok: false, output: 'the board request was not one the app could read' };
    }
    if (rest.length !== bound.words.length) {
      return { ok: false, output: `usage: board ${verb} ${bound.words.map((name) => `<${name}>`).join(' ')}` };
    }
    const raw = { projectPath: folder, ...Object.fromEntries(bound.words.map((name, index) => [name, rest[index]])) };
    const result = await bound.call(withSource(raw, 'command'));
    return sessionReply(result);
  };
}
