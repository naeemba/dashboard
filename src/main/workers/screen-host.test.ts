import type { HookInput, Options, PermissionResult, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inputQueue, type InputQueue } from '../chat/input-queue';
import { prepareHostSocket } from '../panes/pane-host-protocol';
import { HOST_NOT_ANSWERING, hostedQuery, screenHost } from './screen-host-client';
import { acceptApps } from '../panes/host-socket';
import { screenHostServer, type StartSession } from './screen-host-server';
import { screenHostSocket, type FromScreenHost, type ToScreenHost } from './screen-host-protocol';
import { temporaryFolder } from '../testing/temporary-folder';

const KEY = 'ccaaf965-c864-48db-8044-30bf27d93087';
const signal = new AbortController().signal;

// The SDK's query as the host sees it: what it was started with, the messages the test makes it
// stream, and whether it was closed.
function fakeSdk() {
  const sessions: { options: Options; scope: unknown; prompts: SDKUserMessage[]; stream: InputQueue<unknown>; closed: boolean }[] = [];
  const start: StartSession = ({ prompt, options, scope }) => {
    const session = { options, scope, prompts: [] as SDKUserMessage[], stream: inputQueue<unknown>(), closed: false };
    sessions.push(session);
    void (async () => { for await (const each of prompt) session.prompts.push(each); })();
    return {
      [Symbol.asyncIterator]: () => session.stream[Symbol.asyncIterator](),
      close: () => { session.closed = true; session.stream.close(); },
      supportedModels: async () => [{ value: 'opus' }],
    } as unknown as Query;
  };
  return { sessions, start };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));
const hook = (options: Options, event: string, input: object) => options.hooks?.[event as 'Stop']?.[0].hooks[0](input as HookInput, undefined, { signal });

const accepted: net.Socket[] = [];
let listener: net.Server | undefined;
afterEach(() => {
  listener?.close();
  for (const socket of accepted.splice(0)) socket.destroy();
});

function hostSocket(): string {
  const folder = temporaryFolder('screen-host-');
  return screenHostSocket(process.platform, folder) ?? '';
}

async function listen(socketPath: string, start: StartSession, idle = (): void => undefined): Promise<void> {
  prepareHostSocket(process.platform, socketPath);
  const accept = acceptApps<ToScreenHost>(screenHostServer(start, idle));
  listener = net.createServer((socket) => { accepted.push(socket); accept(socket); });
  await new Promise<void>((resolve) => listener?.listen(socketPath, resolve));
}

async function host(start: StartSession, idle = (): void => undefined): Promise<string> {
  const socketPath = hostSocket();
  await listen(socketPath, start, idle);
  return socketPath;
}

// The app's side of one session, as chat-sessions.ts hands it over.
function appSession(heard: string[]) {
  const prompt = inputQueue<SDKUserMessage>();
  const options: Options = {
    cwd: '/work/api',
    hooks: Object.fromEntries(['Stop', 'PostToolUse'].map((event) => [event, [{ hooks: [async (input: HookInput) => { heard.push(`hook ${JSON.stringify(input)}`); return {}; }] }]])),
    canUseTool: async (toolName): Promise<PermissionResult> => {
      heard.push(`ask ${toolName}`);
      return { behavior: 'allow', updatedInput: {} };
    },
  };
  return { prompt, options };
}

describe.skipIf(process.platform === 'win32')('the screen host', () => {
  it('starts the session in the scope the app chose for it', async () => {
    const sdk = fakeSdk();
    const app = screenHost({ socket: await host(sdk.start), launch: () => undefined });
    const scope = { file: 'systemd-run', args: ['--user', '--scope', '--unit=agent-shop-3-k4f2.scope', '--', '/bin/claude'], unit: 'agent-shop-3-k4f2.scope' };
    expect((await app.query(KEY, { ...appSession([]), scope }))?.unit).toBe('agent-shop-3-k4f2.scope');
    await settle();
    expect(sdk.sessions[0].scope).toEqual(scope);
  });

  it('answers the unit a session it kept started in, not the one the next app asks for', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    const scope = (unit: string) => ({ file: 'systemd-run', args: [`--unit=${unit}`, '--', '/bin/claude'], unit });
    await screenHost({ socket: socketPath, launch: () => undefined }).query(KEY, { ...appSession([]), scope: scope('agent-shop-3-k4f2.scope') });
    await settle();
    accepted[0].destroy();
    await settle();
    const second = screenHost({ socket: socketPath, launch: () => undefined });
    await second.ready;
    expect(second.kept(KEY)?.unit).toBe('agent-shop-3-k4f2.scope');
    expect((await second.query(KEY, { ...appSession([]), scope: scope('agent-shop-3-zz99.scope') }))?.unit).toBe('agent-shop-3-k4f2.scope');
    expect(sdk.sessions).toHaveLength(1);
  });

  it('keeps a turn going while no app is connected, and hands the next app what it missed', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    const first = screenHost({ socket: socketPath, launch: () => undefined });
    const heardFirst: string[] = [];
    const before = appSession(heardFirst);
    const query = (await first.query(KEY, before))?.query;
    expect(query).not.toBeNull();
    before.prompt.push({ type: 'user', message: { role: 'user', content: 'fix it' }, parent_tool_use_id: null });
    await settle();
    const [session] = sdk.sessions;
    expect(session.options.cwd).toBe('/work/api');
    expect(session.prompts).toHaveLength(1);
    await hook(session.options, 'UserPromptSubmit', { hook_event_name: 'UserPromptSubmit' });

    // The app quits mid-turn. The session is not closed, and goes on without it.
    accepted[0].destroy();
    await settle();
    expect(session.closed).toBe(false);
    await hook(session.options, 'Stop', { hook_event_name: 'Stop' });
    const answered = session.options.canUseTool?.('Bash', {}, { signal, toolUseID: 'tool-1' } as never);

    const second = screenHost({ socket: socketPath, launch: () => undefined });
    await second.ready;
    expect(second.kept(KEY)).toEqual({ key: KEY, busy: true, unit: null });
    const heard: string[] = [];
    const after = (await second.query(KEY, appSession(heard)))?.query;
    await settle();
    expect(sdk.sessions).toHaveLength(1);
    expect(heard).toEqual(['ask Bash', 'hook {"hook_event_name":"Stop"}']);
    expect(await answered).toEqual({ behavior: 'allow', updatedInput: {} });
    expect(heardFirst).toEqual([]);
    expect(await after?.supportedModels()).toEqual([{ value: 'opus' }]);

    session.stream.push({ type: 'result', subtype: 'success' });
    const iterator = after?.[Symbol.asyncIterator]();
    expect((await iterator?.next())?.value).toEqual({ type: 'result', subtype: 'success' });
    after?.close();
    await settle();
    expect(session.closed).toBe(true);
    expect((await iterator?.next())?.done).toBe(true);
  });

  it('goes once no app is connected and no session runs', async () => {
    const sdk = fakeSdk();
    let idle = 0;
    const socketPath = await host(sdk.start, () => { idle += 1; });
    const app = screenHost({ socket: socketPath, launch: () => undefined });
    await app.query(KEY, appSession([]));
    await settle();
    accepted[0].destroy();
    await settle();
    expect(idle).toBe(0);
    sdk.sessions[0].stream.close();
    await settle();
    expect(idle).toBe(1);
  });

  it('answers null when no host can be reached, so the session runs in the app', async () => {
    const folder = temporaryFolder('screen-host-');
    let launched = 0;
    const app = screenHost({ socket: path.join(folder, 'none.sock'), launch: () => { launched += 1; }, connectTries: 0 });
    await app.ready;
    expect(app.kept(KEY)).toBeUndefined();
    expect(await app.query(KEY, appSession([]))).toBeNull();
    expect(await app.query(KEY, appSession([]))).toBeNull();
    expect(launched).toBe(1);
  });

  it('refuses to run a worker in the app while a host answers that turned it away: it may be running that worker', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    await screenHost({ socket: socketPath, launch: () => undefined }).query(KEY, appSession([]));
    const second = screenHost({ socket: socketPath, launch: () => undefined, connectTries: 0 });
    await expect(second.query(KEY, appSession([]))).rejects.toThrow(HOST_NOT_ANSWERING);
    // Asked again by the next start, which a host that has let the first app go then takes.
    await expect(second.query(KEY, appSession([]))).rejects.toThrow(HOST_NOT_ANSWERING);
    expect(sdk.sessions).toHaveLength(1);
  });

  it('holds what a turn ended with while the app was away: a result clears busy, a hook keeps only its name but Stop', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    await screenHost({ socket: socketPath, launch: () => undefined }).query(KEY, appSession([]));
    await settle();
    const [session] = sdk.sessions;
    await hook(session.options, 'UserPromptSubmit', { hook_event_name: 'UserPromptSubmit' });
    accepted[0].destroy();
    await settle();
    await session.options.hooks?.PostToolUse?.[0].hooks[0]({ hook_event_name: 'PostToolUse', tool_response: 'long' } as never, undefined, { signal });
    session.stream.push({ type: 'result', subtype: 'error_during_execution' });
    await hook(session.options, 'Stop', { hook_event_name: 'Stop', last_assistant_message: 'done' });
    await settle();

    const second = screenHost({ socket: socketPath, launch: () => undefined });
    await second.ready;
    expect(second.kept(KEY)).toEqual({ key: KEY, busy: false, unit: null });
    const heard: string[] = [];
    const after = (await second.query(KEY, appSession(heard)))?.query;
    await settle();
    expect(heard).toEqual(['hook {"hook_event_name":"PostToolUse"}', 'hook {"hook_event_name":"Stop","last_assistant_message":"done"}']);
    expect((await after?.[Symbol.asyncIterator]().next())?.value).toEqual({ type: 'result', subtype: 'error_during_execution' });
  });

  it('ends the app\'s sessions when the host goes, and reaches for a host again on the next', async () => {
    let launched = 0;
    const socketPath = await host(fakeSdk().start);
    const app = screenHost({ socket: socketPath, launch: () => { launched += 1; }, connectTries: 0 });
    const query = (await app.query(KEY, appSession([])))?.query;
    await settle();
    listener?.close();
    accepted[0].destroy();
    await expect(query?.[Symbol.asyncIterator]().next()).rejects.toThrow('The screen host stopped');
    expect(await app.query(KEY, appSession([]))).toBeNull();
    expect(launched).toBe(1);
  });

  it('launches the host again once one it launched itself has gone', async () => {
    const socketPath = hostSocket();
    let launched = 0;
    const app = screenHost({ socket: socketPath, launch: () => { launched += 1; void listen(socketPath, fakeSdk().start); } });
    const query = (await app.query(KEY, appSession([])))?.query;
    expect(launched).toBe(1);
    listener?.close();
    accepted[0].destroy();
    await expect(query?.[Symbol.asyncIterator]().next()).rejects.toThrow('The screen host stopped');
    expect(await app.query(KEY, appSession([]))).not.toBeNull();
    expect(launched).toBe(2);
  });

  it('tells the app nothing of a stopped session, even one that ends before the next start for its key', async () => {
    const sdk = fakeSdk();
    const server = screenHostServer(sdk.start, () => undefined);
    const told: FromScreenHost[] = [];
    server.connect((message) => told.push(message));
    server.receive({ type: 'start', key: KEY, options: {}, hooks: [] });
    server.receive({ type: 'call', key: KEY, id: 1, method: 'supportedModels', args: [] });
    server.receive({ type: 'stop', key: KEY });
    await settle();
    server.receive({ type: 'start', key: KEY, options: {}, hooks: [] });
    await settle();
    expect(sdk.sessions).toHaveLength(2);
    expect(told.filter((message) => message.type === 'ended' || message.type === 'reply')).toEqual([]);
  });

  it('starts a new session for a key stopped a moment ago, and ends the old one in the app', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    const app = screenHost({ socket: socketPath, launch: () => undefined });
    const old = (await app.query(KEY, appSession([])))?.query;
    await settle();
    const oldMessages = old?.[Symbol.asyncIterator]();
    old?.close();
    const fresh = (await app.query(KEY, appSession([])))?.query;
    expect((await oldMessages?.next())?.done).toBe(true);
    await settle();
    expect(sdk.sessions).toHaveLength(2);
    sdk.sessions[1].stream.push({ type: 'assistant' });
    expect((await fresh?.[Symbol.asyncIterator]().next())?.value).toEqual({ type: 'assistant' });
  });
});

describe('hostedQuery', () => {
  it('refuses an option it would have to call back, and sends nothing', () => {
    const sent: ToScreenHost[] = [];
    const params = { prompt: inputQueue<SDKUserMessage>(), options: { stderr: () => undefined } };
    expect(() => hostedQuery(KEY, params, (message) => sent.push(message), () => undefined)).toThrow('stderr');
    expect(sent).toEqual([]);
  });
});
