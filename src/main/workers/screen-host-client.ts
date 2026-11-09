import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type net from 'node:net';
import path from 'node:path';
import { inputQueue } from '../chat/input-queue';
import { launchPaneHost } from '../panes/pane-host-client';
import { attempt, reachHost } from '../panes/host-socket';
import { line, lineReader } from '../panes/pane-host-protocol';
import { screenHostSocket, type AskCallback, type FromScreenHost, type HostedParams, type KeptSession, type ToScreenHost } from './screen-host-protocol';

// The app's half of the screen host: a worker screen's session run there, behind a Query that passes
// every call over the socket, so chat-sessions.ts drives it as it drives one of its own. With no host
// (Windows, a socket that will not open, another Dashboard holding it) a worker screen runs in the app
// as it did before, and dies with it. workers-decision-6 says why.

export type ScreenHost = {
  // Settled once a host already running has said which sessions it kept, or once there is none.
  ready: Promise<void>;
  // The session the host kept through the restart under this conversation id, or undefined.
  kept(key: string): KeptSession | undefined;
  // The session run in the host, started there or taken up if the host still runs it, or null when
  // there is no host to run it.
  query(key: string, params: HostedParams): Promise<Query | null>;
};

type Listener = (message: FromScreenHost) => void;

const ANSWER_WAIT_MS = 5000;
const HOST_STOPPED = 'The screen host stopped';

// `connectTries` is how long a launched host is waited for (reachHost); a test passes 0.
export function screenHost(options: { socket: string | null; launch(): void; connectTries?: number }): ScreenHost {
  let connection: net.Socket | null = null;
  let kept = new Map<string, KeptSession>();
  const listeners = new Map<string, Listener>();
  // One try at the host per run, shared by every worker starting at once: two would each launch a host,
  // and the second would take the socket from the first. Tried again only once a host it had went.
  let reaching: Promise<boolean> | null = null;
  const send = (message: ToScreenHost): void => { connection?.write(line(message)); };

  // Hello and the host's first answer: the sessions it runs, or busy. Null for no host this time.
  function greet(socket: net.Socket): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (taken: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(silence);
        if (!taken) socket.destroy();
        resolve(taken);
      };
      const silence = setTimeout(() => settle(false), ANSWER_WAIT_MS);
      socket.setEncoding('utf8');
      socket.on('data', lineReader<FromScreenHost>((message) => {
        if (!settled) {
          if (message.type === 'sessions') {
            kept = new Map(message.sessions.map((session) => [session.key, session]));
            connection = socket;
          }
          return settle(message.type === 'sessions');
        }
        if ('key' in message) listeners.get(message.key)?.(message);
      }));
      socket.on('close', () => {
        settle(false);
        if (connection !== socket) return;
        connection = null;
        reaching = null;
        kept = new Map();
        for (const [key, listener] of [...listeners]) listener({ type: 'ended', key, error: HOST_STOPPED });
        listeners.clear();
      });
      socket.write(line({ type: 'hello' }));
    });
  }

  // The host already running, if one answers: what it kept is known before any project opens.
  async function join(): Promise<void> {
    if (options.socket === null) return;
    const socket = await attempt(options.socket);
    if (socket !== null) await greet(socket);
  }

  // The host, started when nothing answers.
  function reach(): Promise<boolean> {
    if (connection !== null) return Promise.resolve(true);
    const socketPath = options.socket;
    if (socketPath === null) return Promise.resolve(false);
    reaching ??= reachHost(socketPath, options.launch, options.connectTries).then((socket) => socket !== null && greet(socket));
    return reaching;
  }

  const ready = join();
  return {
    ready,
    kept: (key) => kept.get(key),
    async query(key, params) {
      await ready;
      if (!(await reach())) return null;
      kept.delete(key);
      return hostedQuery(key, params, send, (listener) => {
        if (listener === null) listeners.delete(key);
        else listeners.set(key, listener);
      });
    },
  };
}

// A session in the host as chat-sessions.ts sees it. Its messages arrive as they come; a question or a
// hook calls the app's own callback; any other method is a call over the socket.
export function hostedQuery(key: string, params: HostedParams, send: (message: ToScreenHost) => void, listen: (listener: Listener | null) => void): Query {
  const { canUseTool, onElicitation, hooks, ...rest } = params.options;
  // Anything else a callback would be dropped by the line without a word, and never called.
  const callback = Object.entries(rest).find(([, value]) => typeof value === 'function');
  if (callback) throw new Error(`The screen host cannot call a worker screen's ${callback[0]} back`);
  const messages = inputQueue<unknown>();
  let failure: string | null = null;
  let nextCall = 0;
  const calls = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const asks = new Map<string, AbortController>();
  const callbacks: Record<AskCallback, ((...args: never[]) => Promise<unknown>) | undefined> = { canUseTool, onElicitation };

  async function answer(id: string, callback: AskCallback, args: unknown[]): Promise<void> {
    const controller = new AbortController();
    asks.set(id, controller);
    const given = args.slice(0, -1);
    const last = args.at(-1) as Record<string, unknown> | undefined;
    const value = await (callbacks[callback] as (...called: unknown[]) => Promise<unknown>)?.(...given, { ...last, signal: controller.signal });
    if (asks.delete(id)) send({ type: 'answer', key, id, value });
  }

  // Once, whether the host said it ended or the app closed it: after a stop the host sends nothing
  // more under this key, which a new session may already be using.
  let over = false;
  function end(error: string | null): void {
    if (over) return;
    over = true;
    failure = error;
    listen(null);
    for (const controller of asks.values()) controller.abort();
    for (const pending of calls.values()) pending.reject(new Error(error ?? 'The session ended'));
    calls.clear();
    messages.close();
  }

  listen((message) => {
    if (message.type === 'message') messages.push(message.message);
    else if (message.type === 'ask') void answer(message.id, message.callback, message.args);
    else if (message.type === 'ask-gone') {
      asks.get(message.id)?.abort();
      asks.delete(message.id);
    } else if (message.type === 'hook') {
      const signal = new AbortController().signal;
      for (const matcher of hooks?.[message.event as keyof typeof hooks] ?? []) {
        for (const hook of matcher.hooks) void hook(message.input as never, undefined, { signal });
      }
    } else if (message.type === 'reply') {
      const pending = calls.get(message.id);
      calls.delete(message.id);
      if (message.error === undefined) pending?.resolve(message.value);
      else pending?.reject(new Error(message.error));
    } else if (message.type === 'ended') end(message.error);
  });
  send({ type: 'start', key, options: rest, hooks: Object.keys(hooks ?? {}), scope: params.scope });
  void (async () => {
    for await (const message of params.prompt) send({ type: 'prompt', key, message });
  })();

  function call(method: string, args: unknown[]): Promise<unknown> {
    const id = (nextCall += 1);
    return new Promise((resolve, reject) => {
      calls.set(id, { resolve, reject });
      send({ type: 'call', key, id, method, args });
    });
  }

  async function* stream(): AsyncGenerator<unknown> {
    yield* messages;
    if (failure !== null) throw new Error(failure);
  }

  return new Proxy({}, {
    get(_target, name) {
      if (name === Symbol.asyncIterator) return stream;
      if (name === 'close') return () => { send({ type: 'stop', key }); end(null); };
      // Not a thenable: a Query is never awaited as a whole.
      if (typeof name !== 'string' || name === 'then') return undefined;
      return (...args: unknown[]) => call(name, args);
    },
  }) as Query;
}

// The app's screen host: started detached through the login shell's `node`, as the pane host is, from
// the build folder the commands are unpacked to.
export function workerScreenHost(userData: string, buildFolder: string, home: string): ScreenHost {
  const socket = screenHostSocket(process.platform, userData);
  const entry = path.join(buildFolder, 'screen-host-entry.mjs');
  return screenHost({ socket, launch: () => { if (socket !== null) launchPaneHost(process.env.SHELL, entry, socket, home); } });
}
