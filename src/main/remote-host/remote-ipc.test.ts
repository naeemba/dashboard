import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { Channels } from '../app/channels';
import type { PaneScreenCopy } from '../panes/pane-screen-copy';
import { connectAtLaunch, registerRemote, type HeldForRemote } from './remote-ipc';
import { decodeFrame, encodeFrame, isRequest } from './remote-protocol';
import type { Settings } from '../../shared/settings/settings';

let server: WebSocketServer | undefined;
afterEach(() => { server?.close(); });

// What the real host sends, on joining and in the reply to an open.
const hostList = { projects: [{ name: 'api', path: '/code/api', missing: false }], panes: [[0]] };

function host(): Promise<string> {
  return new Promise((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => resolve(`127.0.0.1:${(server!.address() as { port: number }).port}`));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const frame = decodeFrame(String(raw));
      if (!frame || !isRequest(frame)) return;
      if (frame.channel === 'projects:open') return socket.send(encodeFrame({ id: frame.id, result: { index: 0, open: hostList } }));
      if (frame.args[0] !== 'good') return socket.close(4001, 'The host refused the token');
      socket.send(encodeFrame({ id: frame.id, result: null }));
      socket.send(encodeFrame({ channel: 'projects:change', args: [hostList] }));
    }));
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

function wired() {
  const handlers = new Map<string, (...channelArguments: unknown[]) => unknown>();
  const sent: unknown[][] = [];
  const table = { handle: (channel: string, handler: (...channelArguments: unknown[]) => unknown) => handlers.set(channel, handler) } as unknown as Channels;
  const held: HeldForRemote = {
    table, version: '1', settings: () => ({ remote: {} }) as Settings, log: () => undefined,
    screenCopies: new Map([['0:1', { replay: () => 'copy', exitCode: () => undefined } as PaneScreenCopy]]),
    projects: () => ({ projects: [], panes: [] }),
    worktrees: () => ({ entries: [], paneDirectories: {} }),
    usage: () => 'usage' as never,
  };
  const remote = registerRemote(held, { send: (...message) => { sent.push(message); }, saveSettings: () => undefined });
  const connect = (address: string, token: string) => handlers.get('host:connect')!('screen', address, token) as Promise<string>;
  const disconnect = () => handlers.get('host:disconnect')!('screen');
  return { remote, sent, connect, disconnect };
}

// The local session told to the window, as a screen joining it would be.
const localReplay = [
  ['host:change', 'local'],
  ['projects:change', { projects: [], panes: [] }],
  ['pty:data', '0:1', 'copy'],
  ['worktree:change', { entries: [], paneDirectories: {} }],
  ['usage:change', 'usage'],
];

describe('registerRemote', () => {
  it('keeps only the newest of two overlapping connects', async () => {
    const address = await host();
    const { remote, connect } = wired();
    await Promise.all([connect(address, 'good'), connect(address, 'good')]);
    await settle();
    expect(server!.clients.size).toBe(1);
    expect(remote.current()).not.toBeNull();
    for (const socket of server!.clients) socket.close();
  });

  it('names the joined address before the host list, and relays the reply to an open as it is', async () => {
    const address = await host();
    const { remote, sent, connect } = wired();
    expect(await connect(address, 'good')).toBe('');
    await settle();
    expect(sent.filter(([channel]) => channel !== 'host:report')).toEqual([['host:change', address], ['projects:change', hostList]]);
    await expect(remote.current()!.invoke('projects:open', [null])).resolves.toEqual({ index: 0, open: hostList });
    for (const socket of server!.clients) socket.close();
  });

  it('holds local pushes back from the window from the first frame of the host on', async () => {
    const address = await host();
    const { remote, connect } = wired();
    const connecting = connect(address, 'good');
    expect(remote.reachesWindow()).toBe(true);
    await connecting;
    await settle();
    expect(remote.reachesWindow()).toBe(false);
    for (const socket of server!.clients) socket.close();
  });

  it('leaves the window alone when the first connect is refused before the host said anything', async () => {
    const address = await host();
    const { remote, sent, connect } = wired();
    expect(await connect(address, 'bad')).toBe('The host refused the token');
    expect(remote.reachesWindow()).toBe(true);
    expect(sent).toEqual([]);
  });

  it('drops what a connect overtaken by a disconnect hears from its host', async () => {
    const address = await host();
    const { remote, sent, connect, disconnect } = wired();
    const connecting = connect(address, 'good');
    disconnect();
    await connecting;
    await settle();
    expect(remote.current()).toBeNull();
    expect(remote.reachesWindow()).toBe(true);
    expect(sent).toEqual([]);
  });

  it('puts the local session back when a connect fails after a join', async () => {
    const address = await host();
    const { remote, sent, connect } = wired();
    expect(await connect(address, 'good')).toBe('');
    sent.length = 0;
    expect(await connect(address, 'bad')).toBe('The host refused the token');
    expect(remote.current()).toBeNull();
    expect(remote.reachesWindow()).toBe(true);
    // The old client's close clears the status line first.
    expect(sent).toEqual([['host:report', ''], ...localReplay]);
  });

  it('catches the window up with the local session on disconnect', async () => {
    const address = await host();
    const { remote, sent, connect, disconnect } = wired();
    await connect(address, 'good');
    await settle();
    sent.length = 0;
    disconnect();
    expect(remote.current()).toBeNull();
    expect(sent).toEqual([['host:report', ''], ...localReplay]);
  });

  it('goes back to the local session and keeps the reason when a reconnect is refused', async () => {
    const address = await host();
    const { remote, sent, connect } = wired();
    await connect(address, 'good');
    await settle();
    sent.length = 0;
    for (const socket of server!.clients) socket.close(4001, 'The host refused the token');
    await settle();
    expect(remote.current()).toBeNull();
    expect(sent).toEqual([['host:report', 'The host refused the token'], ...localReplay]);
  });
});

describe('connectAtLaunch', () => {
  function launched(argv: string[]) {
    const listeners = new Map<string, () => void>();
    const connects: unknown[][] = [];
    const held: string[] = [];
    const table = {
      on: (channel: string, listener: () => void) => listeners.set(channel, listener),
      invoke: async (_screen: string, channel: string, channelArguments: unknown[]) => { connects.push([channel, ...channelArguments]); return 'refused'; },
    } as unknown as Channels;
    const settings = () => ({ remote: { address: '10.0.0.2:7777', token: 't' } }) as Settings;
    connectAtLaunch(argv, settings, table, (message) => held.push(message));
    return { restored: () => listeners.get('session:restored')!(), connects, held };
  }

  it('joins once the window has restored, and only the first time', async () => {
    const launch = launched(['--remote']);
    expect(launch.connects).toEqual([]);
    launch.restored();
    launch.restored();
    await settle();
    expect(launch.connects).toEqual([['host:connect', '10.0.0.2:7777', 't']]);
    expect(launch.held).toEqual(['refused']);
  });

  it('says why nothing happened when no host is remembered, and does not join one remembered later', async () => {
    const listeners = new Map<string, () => void>();
    const connects: unknown[] = [];
    const held: string[] = [];
    let address = '';
    const table = {
      on: (channel: string, listener: () => void) => listeners.set(channel, listener),
      invoke: async (...invokeArguments: unknown[]) => { connects.push(invokeArguments); return ''; },
    } as unknown as Channels;
    connectAtLaunch(['--remote'], () => ({ remote: { address, token: 't' } }) as Settings, table, (message) => held.push(message));
    listeners.get('session:restored')!();
    address = '10.0.0.2:7777';
    listeners.get('session:restored')!();
    await settle();
    expect(connects).toEqual([]);
    expect(held).toEqual(['No host remembered for --remote: connect to one from the project list once']);
  });

  it('joins nothing without --remote', async () => {
    const launch = launched([]);
    launch.restored();
    await settle();
    expect(launch.connects).toEqual([]);
  });
});
