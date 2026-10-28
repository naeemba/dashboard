import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { connectRemote, type RemoteClient } from './remote-client';
import { decodeFrame, encodeFrame, isRequest } from './remote-protocol';

let server: WebSocketServer | undefined;
let client: RemoteClient | undefined;
afterEach(() => { client?.close(); server?.close(); });

function hostOn(answer: (channel: string, args: unknown[]) => unknown): Promise<string> {
  return new Promise((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => {
      const address = server!.address()!;
      resolve(typeof address === 'string' ? address : `127.0.0.1:${address.port}`);
    });
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame || !isRequest(frame)) return;
        if (frame.channel === 'host:hello') {
          if (frame.args[0] !== 'good') return socket.close(4001, 'The host refused the token');
          return socket.send(encodeFrame({ id: frame.id, result: null }));
        }
        socket.send(encodeFrame({ id: frame.id, result: answer(frame.channel, frame.args) }));
      });
    });
  });
}

const ports = () => ({ version: '1.17.0', push: () => undefined, status: () => undefined, log: () => undefined });

describe('connectRemote', () => {
  it('connects, then forwards a request and brings back its result', async () => {
    const address = await hostOn((channel, args) => `${channel}:${String(args[0])}`);
    client = await connectRemote(address, 'good', ports());
    await expect(client.invoke('board:read', ['/code/api'])).resolves.toBe('board:read:/code/api');
  });

  it('rejects with the host\'s reason when the token is wrong', async () => {
    const address = await hostOn(() => null);
    await expect(connectRemote(address, 'bad', ports())).rejects.toThrow('The host refused the token');
  });

  it('relays a push to the renderer', async () => {
    const pushed: unknown[] = [];
    const address = await hostOn(() => null);
    client = await connectRemote(address, 'good', { ...ports(), push: (channel, args) => pushed.push([channel, args]) });
    for (const socket of server!.clients) socket.send(encodeFrame({ channel: 'pty:data', args: ['0-1', 'hi'] }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushed).toEqual([['pty:data', ['0-1', 'hi']]]);
  });

  it('times out a request the host never answers', async () => {
    const address = await hostOn(() => null);
    client = await connectRemote(address, 'good', ports());
    for (const socket of server!.clients) socket.removeAllListeners('message');
    await expect(client.invoke('board:read', [], 20)).rejects.toThrow(`No answer from ${address}`);
  });

  it('reconnects after a drop, says hello again, and clears the status', async () => {
    const statuses: string[] = [];
    const address = await hostOn(() => 'again');
    client = await connectRemote(address, 'good', { ...ports(), status: (text) => statuses.push(text) });
    for (const socket of server!.clients) socket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(client.invoke('board:read', [])).rejects.toThrow(`Not connected to ${address}`);
    await new Promise((resolve) => setTimeout(resolve, 2_300));
    await expect(client.invoke('board:read', [])).resolves.toBe('again');
    expect(statuses).toEqual(['', `Reconnecting to ${address}…`, '']);
  }, 10_000);

  it('closes the socket when the hello is never answered', async () => {
    const address = await hostOn(() => null);
    let closed = false;
    server!.on('connection', (socket) => {
      socket.removeAllListeners('message');
      socket.on('close', () => { closed = true; });
    });
    await expect(connectRemote(address, 'good', ports(), 50)).rejects.toThrow(`No answer from ${address}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closed).toBe(true);
  });

  it('stops retrying and says why when a reconnect is refused for its token', async () => {
    const statuses: string[] = [];
    const address = await hostOn(() => null);
    client = await connectRemote(address, 'good', { ...ports(), status: (text) => statuses.push(text) });
    let connections = 0;
    server!.on('connection', () => { connections++; });
    for (const socket of server!.clients) socket.close(4001, 'The host refused the token');
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(statuses.at(-1)).toBe('The host refused the token');
    expect(connections).toBe(0);
  }, 10_000);

  it('drops a reconnect whose hello is still out when the client is closed', async () => {
    const pushed: unknown[] = [];
    let arrivals = 0;
    server = new WebSocketServer({ port: 0 });
    await new Promise((resolve) => server!.on('listening', resolve));
    const address = `127.0.0.1:${(server.address() as { port: number }).port}`;
    server.on('connection', (socket) => {
      const first = ++arrivals === 1;
      socket.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame || !isRequest(frame)) return;
        const answer = () => {
          socket.send(encodeFrame({ id: frame.id, result: null }));
          socket.send(encodeFrame({ channel: 'pty:data', args: ['0-1', 'replay'] }));
        };
        if (first) socket.send(encodeFrame({ id: frame.id, result: null }));
        else setTimeout(() => socket.readyState === socket.OPEN && answer(), 500);
      });
    });
    client = await connectRemote(address, 'good', { ...ports(), push: (channel, args) => pushed.push([channel, args]) });
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 2_300));
    expect(server.clients.size).toBe(1);
    client.close();
    // Well before the delayed reply: the pending socket must be gone because close() reached it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.clients.size).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(pushed).toEqual([]);
    expect(server.clients.size).toBe(0);
  }, 10_000);
});
