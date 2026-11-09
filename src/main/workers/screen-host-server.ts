import type { HookCallbackMatcher, Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { failureText } from '../../shared/errors/failure';
import { isRecord } from '../../shared/app/is-record';
import { inputQueue, type InputQueue } from '../chat/input-queue';
import { type AskCallback, type FromScreenHost, type HostedParams, type HostedStart, type ToScreenHost } from './screen-host-protocol';

// The screen host's half: worker screens' Agent SDK sessions, kept running whether or not an app is
// connected, so a worker's turn goes on through an app restart the way a terminal worker's does in the
// pane host (workers-decision-6). One app at a time; screen-host-entry.ts is the socket around it.
//
// While no app is connected nothing waits on one: a session's messages are dropped (the screen reads
// its transcript back when it opens) but a result, which says the turn is over; a hook is answered at
// once and held for the app to hear, and a question waits until an app answers it. Every hook the app
// gives is told, never asked: the host answers it before the app hears it, so a hook's answer cannot
// change what the session does.

export type StartSession = (params: HostedParams) => Query;

type Ask = { message: FromScreenHost; resolve(value: unknown): void };
type Hosted = {
  // Null once the session has ended, kept only for what it holds for the app.
  query: Query | null;
  input: InputQueue<SDKUserMessage>;
  asks: Map<string, Ask>;
  // What the app missed that it must still hear: the hooks and the end.
  held: FromScreenHost[];
  // Whether the app has taken it up since it connected; until then it hears nothing of it.
  attached: boolean;
  busy: boolean;
  // Asked to stop: the app ended it on its side and hears nothing more of it, and a start for its key
  // begins a new session rather than taking up this one.
  stopped: boolean;
  // The scope its Claude started in, which a later start for the same key does not change.
  unit: string | null;
};

export function screenHostServer(start: StartSession, idle: () => void) {
  const sessions = new Map<string, Hosted>();
  let send: ((message: FromScreenHost) => void) | null = null;

  // To the app if it has taken the session up, otherwise held when it must not be lost.
  function tell(hosted: Hosted, message: FromScreenHost, hold: boolean): void {
    if (hosted.stopped) return;
    if (send !== null && hosted.attached) send(message);
    else if (hold) hosted.held.push(message);
  }

  // No app and nothing running: nobody can reach what is held, and nothing will ask for more.
  function checkIdle(): void {
    if (send === null && ![...sessions.values()].some((hosted) => hosted.query !== null)) idle();
  }

  function ask(key: string, hosted: Hosted, callback: AskCallback, args: unknown[], signal: AbortSignal): Promise<unknown> {
    const id = randomUUID();
    const message: FromScreenHost = { type: 'ask', key, id, callback, args };
    return new Promise((resolve) => {
      hosted.asks.set(id, { message, resolve });
      tell(hosted, message, false);
      signal.addEventListener('abort', () => {
        hosted.asks.delete(id);
        tell(hosted, { type: 'ask-gone', key, id }, false);
      }, { once: true });
    });
  }

  // A hook held for an app that is away keeps only its name, Stop's input excepted: the app reads
  // nothing else of any other, and a PostToolUse's carries the tool's whole output.
  function hooksFor(key: string, hosted: Hosted, events: string[]): Options['hooks'] {
    const told = (event: string): HookCallbackMatcher[] => [{ hooks: [async (input) => {
      if (event === 'UserPromptSubmit') hosted.busy = true;
      const away = send === null || !hosted.attached;
      tell(hosted, { type: 'hook', key, event, input: away && event !== 'Stop' ? { hook_event_name: event } : input }, true);
      return {};
    }] }];
    // UserPromptSubmit is always heard here, since it is what says a turn began.
    return Object.fromEntries([...new Set([...events, 'UserPromptSubmit'])].map((event) => [event, told(event)]));
  }

  function begin(key: string, request: HostedStart): void {
    const input = inputQueue<SDKUserMessage>();
    const hosted: Hosted = { query: null, input, asks: new Map(), held: [], attached: true, busy: false, stopped: false, unit: request.scope?.unit ?? null };
    sessions.set(key, hosted);
    const query = start({
      prompt: input,
      scope: request.scope,
      options: {
        ...request.options,
        hooks: hooksFor(key, hosted, request.hooks),
        canUseTool: (toolName, toolInput, { signal, ...rest }) => ask(key, hosted, 'canUseTool', [toolName, toolInput, rest], signal) as ReturnType<NonNullable<Options['canUseTool']>>,
        onElicitation: (elicitation, { signal, ...rest }) => ask(key, hosted, 'onElicitation', [elicitation, rest], signal) as ReturnType<NonNullable<Options['onElicitation']>>,
      },
    });
    hosted.query = query;
    void (async () => {
      let error: string | null = null;
      try {
        for await (const message of query) {
          const result = isRecord(message) && message.type === 'result';
          if (result) hosted.busy = false;
          // A turn can end without a Stop hook (an API error, a usage limit), so its result is held.
          tell(hosted, { type: 'message', key, message }, result);
        }
      } catch (thrown: unknown) {
        error = failureText(thrown);
      }
      hosted.query = null;
      hosted.busy = false;
      for (const pending of hosted.asks.values()) pending.resolve({ behavior: 'deny', message: 'The session ended.' });
      hosted.asks.clear();
      tell(hosted, { type: 'ended', key, error }, true);
      if (sessions.get(key) === hosted && (hosted.stopped || hosted.held.length === 0)) sessions.delete(key);
      checkIdle();
    })();
  }

  // The app taking up a session the host kept: the questions still waiting on it, and what it missed.
  function attach(key: string, hosted: Hosted): void {
    hosted.attached = true;
    const held = hosted.held;
    hosted.held = [];
    for (const message of [...hosted.asks.values()].map((pending) => pending.message).concat(held)) send?.(message);
    if (hosted.query === null) sessions.delete(key);
  }

  async function call(key: string, id: number, method: string, args: unknown[]): Promise<void> {
    const hosted = sessions.get(key);
    const query = hosted?.query as unknown as Record<string, (...given: unknown[]) => unknown> | null | undefined;
    // A reply for a session stopped meanwhile would answer the next session's call of the same id.
    const reply = (message: FromScreenHost): void => { if (!hosted?.stopped) send?.(message); };
    try {
      if (typeof query?.[method] !== 'function') throw new Error(`The worker screen has no running session to ${method}`);
      reply({ type: 'reply', key, id, value: await query[method](...args) });
    } catch (thrown: unknown) {
      reply({ type: 'reply', key, id, error: failureText(thrown) });
    }
  }

  return {
    connect(answer: (message: FromScreenHost) => void): void {
      send = answer;
      for (const hosted of sessions.values()) hosted.attached = false;
      answer({ type: 'sessions', sessions: [...sessions.entries()].map(([key, hosted]) => ({ key, busy: hosted.busy, unit: hosted.unit })) });
    },
    disconnect(): void {
      send = null;
      checkIdle();
    },
    receive(message: ToScreenHost): void {
      if (message.type === 'hello') return;
      const hosted = sessions.get(message.key);
      if (message.type === 'start') {
        if (hosted && !hosted.stopped) return attach(message.key, hosted);
        begin(message.key, message);
      } else if (message.type === 'prompt') {
        hosted?.input.push(message.message);
      } else if (message.type === 'call') {
        void call(message.key, message.id, message.method, message.args);
      } else if (message.type === 'answer') {
        const pending = hosted?.asks.get(message.id);
        hosted?.asks.delete(message.id);
        pending?.resolve(message.value);
      } else if (message.type === 'stop' && hosted) {
        hosted.stopped = true;
        hosted.input.close();
        hosted.query?.close();
      }
    },
  };
}
