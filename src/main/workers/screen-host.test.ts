import type { HookInput, Options, PermissionResult, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inputQueue } from '../chat/input-queue';
import { prepareHostSocket } from '../panes/pane-host-protocol';
import { screenHost } from './screen-host-client';
import { screenHostSocket } from './screen-host-protocol';
import { acceptScreenApps, screenHostServer, type StartSession } from './screen-host-server';

const KEY = 'ccaaf965-c864-48db-8044-30bf27d93087';
const signal = new AbortController().signal;

// The SDK's query as the host sees it: what it was started with, the messages the test makes it
// stream, and whether it was closed.
function fakeSdk() {
  const sessions: { options: Options; prompts: SDKUserMessage[]; stream: ReturnType<typeof inputQueue<unknown>>; closed: boolean }[] = [];
  const start: StartSession = ({ prompt, options }) => {
    const session = { options, prompts: [] as SDKUserMessage[], stream: inputQueue<unknown>(), closed: false };
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

let folder = '';
const accepted: net.Socket[] = [];
let listener: net.Server | undefined;
afterEach(() => {
  listener?.close();
  for (const socket of accepted.splice(0)) socket.destroy();
  rmSync(folder, { recursive: true, force: true });
});

async function host(start: StartSession, idle = (): void => undefined): Promise<string> {
  folder = mkdtempSync(path.join(os.tmpdir(), 'screen-host-'));
  const socketPath = screenHostSocket(process.platform, folder) ?? '';
  prepareHostSocket(process.platform, socketPath);
  const accept = acceptScreenApps(screenHostServer(start, idle));
  listener = net.createServer((socket) => { accepted.push(socket); accept(socket); });
  await new Promise<void>((resolve) => listener?.listen(socketPath, resolve));
  return socketPath;
}

// The app's side of one session, as chat-sessions.ts hands it over.
function appSession(heard: string[]) {
  const prompt = inputQueue<SDKUserMessage>();
  const options: Options = {
    cwd: '/work/api',
    hooks: { Stop: [{ hooks: [async (input) => { heard.push(`hook ${input.hook_event_name}`); return {}; }] }] },
    canUseTool: async (toolName): Promise<PermissionResult> => {
      heard.push(`ask ${toolName}`);
      return { behavior: 'allow', updatedInput: {} };
    },
  };
  return { prompt, options };
}

describe.skipIf(process.platform === 'win32')('the screen host', () => {
  it('keeps a turn going while no app is connected, and hands the next app what it missed', async () => {
    const sdk = fakeSdk();
    const socketPath = await host(sdk.start);
    const first = screenHost({ socket: socketPath, launch: () => undefined });
    const heardFirst: string[] = [];
    const before = appSession(heardFirst);
    const query = await first.query(KEY, before);
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
    expect(second.kept(KEY)).toEqual({ key: KEY, busy: true });
    const heard: string[] = [];
    const after = await second.query(KEY, appSession(heard));
    await settle();
    expect(sdk.sessions).toHaveLength(1);
    expect(heard).toEqual(['ask Bash', 'hook Stop']);
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
    folder = mkdtempSync(path.join(os.tmpdir(), 'screen-host-'));
    let launched = 0;
    const app = screenHost({ socket: path.join(folder, 'none.sock'), launch: () => { launched += 1; }, connect: async () => null });
    await app.ready;
    expect(app.kept(KEY)).toBeUndefined();
    expect(await app.query(KEY, appSession([]))).toBeNull();
    expect(launched).toBe(1);
  }, 10_000);
});
