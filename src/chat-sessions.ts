import type { ModelInfo, PermissionMode, PermissionResult, Query, SDKSessionInfo, SDKUserMessage, SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import { mainPrompt, mainSessionName } from './dispatch';
import { measureOf, type ChatMeasure } from './chat-status';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { replaceFile } from './board-store';
import path from 'node:path';
import type { ChatContent } from './bridge';
import type { Channels } from './channels';
import { conversationChange, modeOf, type ChatEvent } from './chat-transcript';
import type { PermissionAsk } from './chat-permission';
import { pdfRefusal, type PdfRead } from './chat-pdf';
import { fileCandidates } from './file-open';
import { homedir } from 'node:os';
import { failureText } from './failure';
import { isRecord } from './is-record';

// The Claude screen's half in main: one Agent SDK session per project page, the project's main
// session. It is started when the project opens and again after a new conversation or a /resume, and
// kept open in streaming input mode, so every prompt goes into the same process and a worker's
// SendMessage has somewhere to arrive. The renderer draws; everything here is the session and the
// questions it is waiting on.
//
// A conversation outlives the app by its id. The app keeps the id the session reports per project in
// chat-sessions.json; the next launch resumes that id when the project opens and reads its history
// back for the screen to draw. /resume lists the older ones.

export type ChatHost = {
  send(slot: number, event: ChatEvent): void;
  projectPath(slot: number): string | undefined;
  // The environment every pane gets, so the agent's own shell can find the board command too.
  environment: Record<string, string>;
  userData: string;
};

// What the renderer may change on a running session. Held per slot so a choice made before the first
// prompt is what the session starts with. The default model is null rather than undefined: the second
// screen's link is JSON, which drops an undefined field, and a change back to the default would arrive
// as no change at all.
export type ChatPreferences = { model?: string | null; permissionMode?: PermissionMode };

export type ChatState = { messages: Record<string, unknown>[]; asks: PermissionAsk[]; preferences: ChatPreferences };

// The conversations /resume offers, newest first, and the one this page is on.
export type ChatSessions = { current: string | null; sessions: Pick<SDKSessionInfo, 'sessionId' | 'summary' | 'lastModified' | 'gitBranch'>[] };

export type InputQueue<T> = AsyncIterable<T> & { push(message: T): void; close(): void };

// `stopped` is a close the app asked for — a project closed, a new conversation — which ends the
// stream like a crash does and must not be reported as one.
type Session = {
  query: Query;
  input: InputQueue<SDKUserMessage>;
  // Kept with what was asked, so a screen that connects while one waits can still answer it.
  asks: Map<string, { ask: PermissionAsk; resolve(result: PermissionResult): void }>;
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
// inside an asar, and the SDK would find the copy inside it. On a musl Linux npm installs the `-musl`
// package instead, so that name is tried when the plain one is not there.
function claudeExecutable(): string {
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const name = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  let found: string;
  try {
    found = require.resolve(`${name}/${binary}`);
  } catch (error) {
    if (process.platform !== 'linux') throw error;
    found = require.resolve(`${name}-musl/${binary}`);
  }
  return found.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// The PATH a pane's shell builds from its startup files, which the app itself never read when it was
// started from a launcher: without it a hook running `node` or an MCP server started with `npx` works
// for `claude` typed in a pane and not here. An interactive shell may print a banner first, so the
// PATH is the last line; anything that goes wrong leaves the app's own.
export function pathFromShell(output: string, fallback: string): string {
  return output.split('\n').pop()?.trim() || fallback;
}

function loginShellPath(fallback: string): Promise<string> {
  const shell = process.env.SHELL;
  if (!shell || process.platform === 'win32') return Promise.resolve(fallback);
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', 'printf %s "$PATH"'], { timeout: 5000, encoding: 'utf8' }, (error, output) => {
      resolve(error ? fallback : pathFromShell(output, fallback));
    });
  });
}

// The messages the pane reads. The rest — hook progress, rate limit events, task updates, and of the
// streamed events everything but a block starting and text or thinking arriving — are left on this
// side of the wire rather than sent to every screen on every token. A Write streams the whole file as
// its input, so the working line's count leaves tool input out.
const RELAYED = new Set(['assistant', 'user', 'result', 'system', 'prompt_suggestion']);
const RELAYED_STREAM = new Set(['content_block_start', 'text_delta', 'thinking_delta']);

export function relayed(message: { type: string; event?: unknown }): boolean {
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

// What a project's main session opens on. The conversation the terminal main left wins over one the
// old Claude view remembered: it was the project's main, the one its workers report to, and `adopt`
// only arrives on the first launch after main became the screen. Auto mode, as the terminal main ran
// in, unless the screen has already chosen another.
export function mainSessionStart(
  remembered: string | undefined, adopt: string | undefined, kept: ChatPreferences | undefined,
): { resume: string | undefined; preferences: ChatPreferences } {
  return { resume: adopt ?? remembered, preferences: { ...kept, permissionMode: kept?.permissionMode ?? 'auto' } };
}

export function registerChatSessions(
  table: Channels,
  host: ChatHost,
): { open(slot: number, adopt?: string): void; stop(slot: number): void; stopAll(): void } {
  // Promises, so a second prompt sent while the SDK is still loading joins the session the first one
  // is starting rather than starting a second process.
  const sessions = new Map<number, Promise<Session>>();
  const preferences = new Map<number, ChatPreferences>();
  const file = path.join(host.userData, 'chat-sessions.json');
  const remembered = rememberedSessions(file);
  // Read once, the first time a session starts, rather than at launch for a screen that may never be used.
  let shellPath: Promise<string> | undefined;

  function remember(projectPath: string, id: string | undefined): void {
    if (id === undefined) delete remembered[projectPath];
    else remembered[projectPath] = id;
    try {
      replaceFile(file, JSON.stringify(remembered, null, 2));
    } catch {
      // ponytail: a write that fails costs the resume on the next launch and nothing else.
    }
  }

  function ask(slot: number, asks: Session['asks'], asked: Omit<PermissionAsk, 'id'>, signal: AbortSignal): Promise<PermissionResult> {
    const id = randomUUID();
    const pending = { ...asked, id };
    host.send(slot, { kind: 'ask', ask: pending });
    return new Promise((resolve) => {
      asks.set(id, { ask: pending, resolve });
      signal.addEventListener('abort', () => {
        asks.delete(id);
        host.send(slot, { kind: 'ask-gone', id });
        resolve({ behavior: 'deny', message: 'Interrupted.' });
      }, { once: true });
    });
  }

  async function start(slot: number, projectPath: string): Promise<Session> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    shellPath ??= loginShellPath(host.environment.PATH ?? '');
    const environment = { ...host.environment, PATH: await shellPath };
    const executable = claudeExecutable();
    const resume = remembered[projectPath];
    const input = inputQueue<SDKUserMessage>();
    const asks: Session['asks'] = new Map();
    const session: Session = { input, asks, stopped: false, query: query({
      prompt: input,
      options: {
        cwd: projectPath,
        resume,
        model: preferences.get(slot)?.model ?? undefined,
        // The project's main session, as the terminal one was: the mode open() seeded or the screen
        // chose, the dispatch prompt, and the name its workers SendMessage it by.
        permissionMode: preferences.get(slot)?.permissionMode,
        extraArgs: { name: mainSessionName(projectPath) },
        env: environment,
        includePartialMessages: true,
        // The next prompt Claude Code would offer, after each turn's result. The CLI holds it back on
        // the first turn, in plan mode, after an API error, near the usage limit, and when settings.json
        // has promptSuggestionEnabled: false.
        promptSuggestions: true,
        pathToClaudeCodeExecutable: executable,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: mainPrompt(projectPath) },
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
      // Whether a turn ever began. After one, the conversation remembered may have moved on (/clear,
      // then a new init), and a crash is no sign the resume was bad.
      let started = false;
      try {
        for await (const message of session.query) {
          const record = message as unknown as Record<string, unknown>;
          if (message.type === 'system' && message.subtype === 'init') started = true;
          // /clear: the session goes on in a new conversation, which the next turn's init names. Until
          // then the cleared one is not what the next launch should resume.
          const change = conversationChange(record, remembered[projectPath]);
          if (change.remember !== undefined) remember(projectPath, change.remember ?? undefined);
          if (change.reset) host.send(slot, { kind: 'reset' });
          const mode = modeOf(record);
          if (mode) preferences.set(slot, { ...preferences.get(slot), permissionMode: mode });
          if (relayed(message)) host.send(slot, { kind: 'message', message: record });
        }
      } catch (thrown: unknown) {
        error = failureText(thrown);
        // A resume that cannot start — the file was deleted, the folder moved — would fail the same
        // way on every prompt after it, so the next one starts a new conversation instead.
        if (resume && !started) remember(projectPath, undefined);
      }
      for (const { resolve } of session.asks.values()) resolve({ behavior: 'deny', message: 'The session ended.' });
      // An end nobody asked for is not restarted here: a session that dies on start would die again
      // in a loop. The screen says it ended, and the next prompt starts it.
      if (session.stopped) return;
      sessions.delete(slot);
      host.send(slot, { kind: 'ended', error });
    })();
    return session;
  }

  // This page's session, started if it is not running. One that fails to start is forgotten, so the
  // next prompt tries again.
  function running(slot: number, projectPath: string): Promise<Session> {
    let session = sessions.get(slot);
    if (!session) {
      session = start(slot, projectPath);
      sessions.set(slot, session);
      session.catch((error: unknown) => {
        if (sessions.get(slot) === session) sessions.delete(slot);
        host.send(slot, { kind: 'ended', error: failureText(error) });
      });
    }
    return session;
  }

  // A prompt for this page's session.
  table.on('chat:send', (_screen, slot: number, content: ChatContent) => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return;
    host.send(slot, { kind: 'prompt', content });
    running(slot, projectPath).then(
      (session) => session.input.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }),
      () => undefined,
    );
  });

  // The slash commands the session would run, for the menu. The list is the CLI's, and only a running
  // session has it; one that has ended is started again by the asking, as a prompt would.
  table.handle('chat:commands', async (_screen, slot: number): Promise<SlashCommand[]> => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return [];
    return (await running(slot, projectPath)).query.supportedCommands();
  });

  // The models /model lists, as the session offers them; asking starts it, as the command list does.
  table.handle('chat-models:read', async (_screen, slot: number): Promise<ModelInfo[]> => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return [];
    return (await running(slot, projectPath)).query.supportedModels();
  });

  // The project's earlier conversations, as Claude Code's own /resume lists them for the folder:
  // a worktree's are its own, so a worker's conversations do not crowd the project's.
  table.handle('chat:sessions', async (_screen, slot: number): Promise<ChatSessions> => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return { current: null, sessions: [] };
    const { listSessions } = await import('@anthropic-ai/claude-agent-sdk');
    const found = await listSessions({ dir: projectPath, includeWorktrees: false, limit: 50 });
    return {
      current: remembered[projectPath] ?? null,
      sessions: found.map(({ sessionId, summary, lastModified, gitBranch }) => ({ sessionId, summary, lastModified, gitBranch })),
    };
  });

  table.on('chat:interrupt', (_screen, slot: number) => {
    sessions.get(slot)?.then((session) => session.query.interrupt()).catch(() => undefined);
  });

  // Every screen is told the question is gone, so the one it was not answered on stops showing it.
  table.on('chat:answer', (_screen, slot: number, id: string, result: PermissionResult) => {
    void sessions.get(slot)?.then((session) => {
      const pending = session.asks.get(id);
      if (!pending) return;
      session.asks.delete(id);
      pending.resolve(result);
      host.send(slot, { kind: 'ask-gone', id });
    }, () => undefined);
  });

  table.handle('chat:configure', async (_screen, slot: number, change: ChatPreferences) => {
    preferences.set(slot, { ...preferences.get(slot), ...change });
    host.send(slot, { kind: 'configured', change });
    const session = await sessions.get(slot);
    if (!session) return;
    if ('model' in change) await session.query.setModel(change.model ?? undefined);
    if (change.permissionMode) await session.query.setPermissionMode(change.permissionMode);
  });

  // What the status line shows: how full the context window is, read from the last response rather
  // than counted again, the model by its shown name, and the plan's limits. The limits come from an
  // experimental call; a release that drops it leaves the line without them and nothing else.
  table.handle('chat:measure', async (_screen, slot: number): Promise<ChatMeasure | null> => {
    const session = await sessions.get(slot);
    if (!session) return null;
    const [context, models, usage] = await Promise.all([
      session.query.getContextUsage({ detail: 'summary' }),
      session.query.supportedModels(),
      session.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }).catch(() => null),
    ]);
    return measureOf(context, models, usage);
  });

  // What a screen opening this page needs to catch up: the conversation it would resume, read back
  // from its transcript, the questions the session is waiting on, and the choices made so far.
  table.handle('chat:read', async (_screen, slot: number): Promise<ChatState> => {
    const projectPath = host.projectPath(slot);
    const sessionId = projectPath === undefined ? undefined : remembered[projectPath];
    const { getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk');
    const messages = projectPath === undefined || sessionId === undefined ? [] : await getSessionMessages(sessionId, { dir: projectPath });
    // Taken after the read, so a question answered on another screen while it ran is not handed back
    // as still waiting.
    const running = await sessions.get(slot)?.catch(() => undefined);
    const asks = running ? [...running.asks.values()].map((pending) => pending.ask) : [];
    return { messages, asks, preferences: preferences.get(slot) ?? {} };
  });

  // A PDF the conversation names, for the tile that opens it. A mention is relative to the session's
  // folder, as Claude Code reads it; a Read call's path is whole. A page with no folder has nowhere a
  // mention could be.
  table.handle('pdf:read', async (_screen, slot: number, file: string): Promise<PdfRead> => {
    const [absolute] = fileCandidates(file, [host.projectPath(slot)], homedir());
    if (absolute === undefined) return { refused: pdfRefusal(file, null) };
    const size = await stat(absolute).then((info) => (info.isFile() ? info.size : null), () => null);
    const refused = pdfRefusal(file, size);
    if (refused !== null) return { refused };
    return { data: (await readFile(absolute)).toString('base64') };
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

  // A new conversation: the running one is closed, the page forgets its id, and a fresh session starts
  // at once, so a worker's report still has a main to arrive at. The old transcript stays on disk for
  // whatever lists sessions later. Every screen is told, so none keeps showing the closed one.
  table.on('chat:reset', (_screen, slot: number) => {
    const projectPath = host.projectPath(slot);
    stop(slot);
    if (projectPath === undefined) return;
    remember(projectPath, undefined);
    host.send(slot, { kind: 'reset' });
    running(slot, projectPath).catch(() => undefined);
  });

  // An earlier conversation picked in /resume: the running one is closed, the page remembers the picked
  // one, and a session resuming it starts at once. Every screen reads it back.
  table.on('chat:resume', (_screen, slot: number, sessionId: string) => {
    const projectPath = host.projectPath(slot);
    if (projectPath === undefined) return;
    stop(slot);
    remember(projectPath, sessionId);
    host.send(slot, { kind: 'reset' });
    running(slot, projectPath).catch(() => undefined);
  });

  return {
    // A project opening starts its main session at once, as the terminal one was, so a worker's
    // SendMessage has somewhere to arrive. `adopt` is the conversation the terminal main left;
    // mainSessionStart says what wins.
    open(slot, adopt) {
      const projectPath = host.projectPath(slot);
      if (projectPath === undefined) return;
      const opening = mainSessionStart(remembered[projectPath], adopt, preferences.get(slot));
      if (opening.resume !== remembered[projectPath]) remember(projectPath, opening.resume);
      preferences.set(slot, opening.preferences);
      running(slot, projectPath).catch(() => undefined);
    },
    // A closed project's choices go with it: a project opened later into the same slot starts on
    // the defaults.
    stop: (slot) => { stop(slot); preferences.delete(slot); },
    stopAll: () => { for (const slot of [...sessions.keys()]) stop(slot); },
  };
}
