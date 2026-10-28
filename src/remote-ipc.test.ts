import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { Channels } from './channels';
import { registerRemote } from './remote-ipc';
import { decodeFrame, encodeFrame, isRequest } from './remote-protocol';
import type { Settings } from './settings';

let server: WebSocketServer | undefined;
afterEach(() => { server?.close(); });

function host(): Promise<string> {
  return new Promise((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => resolve(`127.0.0.1:${(server!.address() as { port: number }).port}`));
    server.on('connection', (socket) => socket.on('message', (raw) => {
      const frame = decodeFrame(String(raw));
      if (!frame || !isRequest(frame)) return;
      if (frame.args[0] !== 'good') return socket.close(4001, 'The host refused the token');
      socket.send(encodeFrame({ id: frame.id, result: null }));
    }));
  });
}

function wired() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: unknown[][] = [];
  const table = { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) } as unknown as Channels;
  const remote = registerRemote(table, {
    version: '1', send: (...message) => { sent.push(message); }, settings: () => ({ remote: {} }) as Settings,
    saveSettings: () => undefined, log: () => undefined, localProjects: () => 'local',
  });
  const connect = (address: string, token: string) => handlers.get('host:connect')!('screen', address, token) as Promise<string>;
  return { remote, sent, connect };
}

describe('registerRemote', () => {
  it('keeps only the newest of two overlapping connects', async () => {
    const address = await host();
    const { remote, connect } = wired();
    await Promise.all([connect(address, 'good'), connect(address, 'good')]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server!.clients.size).toBe(1);
    expect(remote.current()).not.toBeNull();
    for (const socket of server!.clients) socket.close();
  });

  it('puts the local projects back when a connect fails after a join', async () => {
    const address = await host();
    const { remote, sent, connect } = wired();
    expect(await connect(address, 'good')).toBe('');
    expect(await connect(address, 'bad')).toBe('The host refused the token');
    expect(remote.current()).toBeNull();
    expect(sent).toContainEqual(['projects:change', 'local']);
  });
});
