import { connect, createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { channels } from '../app/channels';
import { connectRemote, type RemoteClient } from './remote-client';
import { startRemoteHost, type HostPorts, type RemoteHost } from './remote-host';
import { encodeFrame } from './remote-protocol';

let host: RemoteHost | undefined;
let client: RemoteClient | undefined;
afterEach(() => { client?.close(); host?.close(); });

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

// One of this machine's non-loopback IPv4 addresses, the one a machine on the same network would dial.
const networkAddress = Object.values(networkInterfaces()).flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

// Whether a plain TCP connection to the address is accepted.
function reachable(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, address);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

function hosted() {
  const table = channels();
  table.handle('board:read', (screen, projectPath: string) => `${screen.split('@')[0]} read ${projectPath}`);
  const joined: string[] = [];
  const left: string[] = [];
  const held: string[] = [];
  const ports: HostPorts = {
    table, token: () => 'good', version: '1',
    onJoin: (screen, send) => { joined.push(screen); send('projects:change', [{ projects: [] }]); },
    onLeave: (screen) => left.push(screen),
    log: () => undefined,
    hold: (message) => held.push(message),
  };
  return { ports, joined, left, held };
}

const clientPorts = (pushed: unknown[][] = []) => ({
  version: '1', push: (channel: string, channelArguments: unknown[]) => pushed.push([channel, ...channelArguments]),
  status: () => undefined, log: () => undefined, gone: () => undefined,
});

describe('startRemoteHost', () => {
  it('lets a screen join, serves its request as that screen, refuses its own channels, and forgets it when it leaves', async () => {
    const port = await freePort();
    const wired = hosted();
    host = startRemoteHost(port, '127.0.0.1', wired.ports);
    const pushed: unknown[][] = [];
    client = await connectRemote(`127.0.0.1:${port}`, 'good', clientPorts(pushed));
    await settle();
    expect(wired.joined).toHaveLength(1);
    expect(pushed).toEqual([['projects:change', { projects: [] }]]);
    await expect(client.invoke('board:read', ['/code/api'])).resolves.toBe('screen-1 read /code/api');
    await expect(client.invoke('settings:write', [{}])).rejects.toThrow('Not served to a remote screen: settings:write');
    client.close();
    client = undefined;
    await settle();
    expect(wired.left).toEqual(wired.joined);
  });

  // The screen that wrote a board already has it; every other screen must hear of the write.
  it('pushes to every screen but the one that caused it', async () => {
    const port = await freePort();
    const wired = hosted();
    host = startRemoteHost(port, '127.0.0.1', wired.ports);
    const firstPushed: unknown[][] = [];
    const secondPushed: unknown[][] = [];
    client = await connectRemote(`127.0.0.1:${port}`, 'good', clientPorts(firstPushed));
    const second = await connectRemote(`127.0.0.1:${port}`, 'good', clientPorts(secondPushed));
    await settle();
    host.broadcast('board:change', ['/code/api'], wired.joined[0]);
    await settle();
    second.close();
    expect(firstPushed).not.toContainEqual(['board:change', '/code/api']);
    expect(secondPushed).toContainEqual(['board:change', '/code/api']);
  });

  it('drops a screen that stops answering its pings', async () => {
    const port = await freePort();
    const wired = hosted();
    host = startRemoteHost(port, '127.0.0.1', wired.ports, 50);
    // A socket that says hello and then never answers a ping: a mac whose lid was closed.
    const asleep = new WebSocket(`ws://127.0.0.1:${port}`, { autoPong: false });
    await new Promise((resolve) => asleep.on('open', resolve));
    asleep.send(encodeFrame({ id: 1, channel: 'host:join', args: ['good', '1'] }));
    await settle(300);
    expect(wired.joined).toHaveLength(1);
    expect(wired.left).toEqual(wired.joined);
  });

  it('puts a port it cannot open on the status bar', async () => {
    const port = await freePort();
    const first = hosted();
    host = startRemoteHost(port, '127.0.0.1', first.ports);
    await settle();
    const second = hosted();
    const clash = startRemoteHost(port, '127.0.0.1', second.ports);
    await settle();
    clash.close();
    expect(second.held).toEqual([expect.stringContaining(`Not listening on 127.0.0.1:${port}`)]);
  });

  // A machine on the network cannot connect to the default bind; host.bind 0.0.0.0 lets it.
  it.skipIf(networkAddress === undefined)('listens only on the interface host.bind names', async () => {
    const port = await freePort();
    host = startRemoteHost(port, '127.0.0.1', hosted().ports);
    await settle();
    await expect(reachable(networkAddress as string, port)).resolves.toBe(false);
    host.close();
    const open = await freePort();
    host = startRemoteHost(open, '0.0.0.0', hosted().ports);
    await settle();
    await expect(reachable(networkAddress as string, open)).resolves.toBe(true);
  });
});
