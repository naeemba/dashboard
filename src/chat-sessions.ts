import type { PermissionMode, PermissionResult, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { replaceFile } from './board-store';
import path from 'node:path';
import type { ChatContent } from './bridge';
import type { Channels } from './channels';
import type { ChatEvent } from './chat-transcript';
import type { PermissionAsk } from './chat-permission';
import { failureText } from './failure';
import { isRecord } from './is-record';

// The chat pane's half in main: one Agent SDK session per project page, started the first time a
// prompt is sent and kept open in streaming input mode, so a second prompt goes into the same process
// rather than starting another. The renderer draws; everything here is the session and the questions
// it is waiting on.
//
// A conversation outlives the app by its id. The app picks the id when it starts one and keeps it per
// project in chat-sessions.json; the next launch resumes that id on the first prompt and reads its
// history back for the pane to draw. The drawer card is what gets to list older ones.

export type ChatHost = {
  send(slot: number, event: ChatEvent): void;
  projectPath(slot: number): string | undefined;
  // The environment every pane gets, so the agent's own shell can find the board command too.
  environment: Record<string, string>;
  userData: string;
};

// What the renderer may change on a running session. Held per slot so a choice made before the first
// prompt is what the session starts with.
export type ChatPreferences = { model?: string; permissionMode?: PermissionMode };

export type InputQueue<T> = AsyncIterable<T> & { push(message: T): void; close(): void };

// `stopped` is a close the app asked for — a project closed, a new conversation — which ends the
// stream like a crash does and must not be reported as one.
type Session = {
  query: Query;
  input: InputQueue<SDKUserMessage>;
  asks: Map<string, (result: PermissionResult) => void>;
  stopped: boolean;
};

// The prompts of one session, handed to the SDK as the async iterable streaming input mode reads.
export function inputQueue<T>(): InputQueue<T> {
  const waiting: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(message) { waiting.push(message); wake?.(); },
    close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (waiting.length > 0) yield waiting.shift() as T;
        if (closed) return;
        await new Promise<void>((resolve) => { wake = resolve; });
        wake = null;
      }
    },
  };
}

// The CLI the SDK drives, from the platform package npm installed beside it. Named here rather than
// left to the SDK because a packaged app keeps it in app.asar.unpacked: nothing can be executed from
// inside an asar, and the SDK would find the copy inside it.
function claudeExecutable(): string {
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  return require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${binary}`)
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// The messages the pane reads. The rest — hook progress, rate limit events, task updates, and of the
// streamed events everything but a block starting and text arriving — are left on this side of the
// wire rather than sent to every screen on every token. A Write streams the whole file as its input.
const RELAYED = new Set(['assistant', 'user', 'result', 'system']);
const RELAYED_STREAM = new Set(['content_block_start', 'text_delta']);

function relayed(message: { type: string; event?: unknown }): boolean {
  if (message.type !== 'stream_event') return RELAYED.has(message.type);
  const event = isRecord(message.event) ? message.event : {};
  const delta = isRecord(event.delta) ? event.delta.type : undefined;
  return RELAYED_STREAM.has(String(event.type)) || RELAYED_STREAM.has(String(delta));
}

// A file that is missing, unreadable or not what this app wrote reads as nothing remembered: the cost
// is a new conversation where the last one would have been resumed.
export function rememberedSessions(file: string): Record<string, string> {
  try {
    const read: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isRecord(read) ? Object.fromEntries(Object.entries(read).filter(([, id]) => typeof id === 'string')) as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function registerChatSessions(table: Channels, host: ChatHost): { stop(slot: number): void; stopAll(): void } {
  // Promises, so a second prompt sent while the SDK is still loading joins the session the first one
  // is starting rather than starting a second process.
  const sessions = new Map<number, Promise<Session>>();
  const preferences = new Map<number, ChatPreferences>();
  const file = path.join(host.userData, 'chat-sessions.json');
  const remembered = rememberedSessions(file);

  function remember(projectPath: string, id: string | undefined): void {
    if (id === undefined) delete remembered[projectPath];
    else remembered[projectPath] = id;
    try {
      replaceFile(file, JSON.stringify(remembered, null, 2));
    } catch {
      // ponytail: a write that fails costs the resume on the next launch and nothing else.
    }
  }

  function ask(slot: number, asks: Session['asks'], ask: Omit<PermissionAsk, 'id'>, signal: AbortSignal): Promise<PermissionResult> {
    const id = randomUUID();
    host.send(slot, { kind: 'ask', ask: { ...ask, id } });
    return new Promise((resolve) => {
      asks.set(id, resolve);
      signal.addEventListener('abort', () => {
        asks.delete(id);
        host.send(slot, { kind: 'ask-gone', id });
        resolve({ behavior: 'deny', message: 'Interrupted.' });
      }, { once: true });
    });
  }

  async function start(slot: number, projectPath: string): Promise<Session> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const resume = remembered[projectPath];
    const sessionId = resume ?? randomUUID();
    if (!resume) remember(projectPath, sessionId);
    const input = inputQueue<SDKUserMessage>();
    const asks: Session['asks'] = new Map();
    const session: Session = { input, asks, stopped: false, query: query({
      prompt: input,
      options: {
        cwd: projectPath,
        ...(resume ? { resume } : { sessionId }),
        ...preferences.get(slot),
        env: host.environment,
        includePartialMessages: true,
        pathToClaudeCodeExecutable: claudeExecutable(),
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        canUseTool: (toolName, toolInput, options) => ask(slot, asks, {
          toolName,
          input: toolInput,
          title: options.title,
          description: options.description ?? options.decisionReason,
          suggestions: options.suggestions,
          defaultToNo: options.defaultToNo === true,
          suppressAlwaysAllowRule: options.suppressAlwaysAllowRule === true,
        }, options.signal),
      },
    }) };
    void (async () => {
      let error: string | null = null;
      try {
        for await (const message of session.query) {
          if (relayed(message)) host.send(slot, { kind: 'message', message: message as unknown as Record<string, unknown> });
        }
      } catch (thrown: unknown) {
        error = failureText(thrown);
        // A resume that cannot start — the file was deleted, the folder moved — would fail the same
        // way on every prompt after it, so the next one starts a new conversation instead.
        if (resume) remember(projectPath, undefined);
      }
      for (const resolve of session.asks.values()) resolve({ behavior: 'deny', message: 'The session ended.' });
      if (session.stopped) return;
      sessions.delete(slot);
      host.send(slot, { kind: 'ended', error });
    })();
    return session;
  }

  // A prompt for this page's session, which is started if it is not running.
  table.on('chat:send', (_screen, slot: number, content: ChatContent) => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return;
    let session = sessions.get(slot);
    if (!session) {
      session = start(slot, projectPath);
      sessions.set(slot, session);
    }
    session.then(
      (running) => running.input.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }),
      (error: unknown) => {
        sessions.delete(slot);
        host.send(slot, { kind: 'ended', error: failureText(error) });
      },
    );
  });

  table.on('chat:interrupt', (_screen, slot: number) => {
    sessions.get(slot)?.then((session) => session.query.interrupt()).catch(() => undefined);
  });

  table.on('chat:answer', (_screen, slot: number, id: string, result: PermissionResult) => {
    void sessions.get(slot)?.then((session) => {
      const resolve = session.asks.get(id);
      session.asks.delete(id);
      resolve?.(result);
    });
  });

  table.handle('chat:configure', async (_screen, slot: number, change: ChatPreferences) => {
    preferences.set(slot, { ...preferences.get(slot), ...change });
    const session = await sessions.get(slot);
    if (!session) return;
    if ('model' in change) await session.query.setModel(change.model);
    if (change.permissionMode) await session.query.setPermissionMode(change.permissionMode);
  });

  // How full the context window is, read from the last response rather than counted again.
  table.handle('chat:measure', async (_screen, slot: number) => {
    const session = await sessions.get(slot);
    if (!session) return null;
    return (await session.query.getContextUsage({ detail: 'summary' })).percentage;
  });

  // The conversation this page would resume, read back from its transcript so the pane can draw it
  // before anything has been sent.
  table.handle('chat:read', async (_screen, slot: number) => {
    const projectPath = host.projectPath(slot);
    const sessionId = projectPath === undefined ? undefined : remembered[projectPath];
    if (projectPath === undefined || sessionId === undefined) return [];
    const { getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk');
    return getSessionMessages(sessionId, { dir: projectPath });
  });

  function stop(slot: number): void {
    const session = sessions.get(slot);
    sessions.delete(slot);
    void session?.then((running) => {
      running.stopped = true;
      running.input.close();
      running.query.close();
    }, () => undefined);
  }

  // A new conversation: the running one is closed and the page forgets its id, so the next prompt
  // starts fresh. The old transcript stays on disk for whatever lists sessions later.
  table.on('chat:reset', (_screen, slot: number) => {
    const projectPath = host.projectPath(slot);
    stop(slot);
    if (projectPath !== undefined) remember(projectPath, undefined);
  });

  return {
    // A closed project's choices go with it: a project opened later into the same slot starts on
    // the defaults.
    stop: (slot) => { stop(slot); preferences.delete(slot); },
    stopAll: () => { for (const slot of [...sessions.keys()]) stop(slot); },
  };
}
