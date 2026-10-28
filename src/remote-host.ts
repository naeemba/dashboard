import { WebSocketServer, type WebSocket } from 'ws';
import type { Channels } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import {
  HELLO_CHANNEL, decodeFrame, encodeFrame, helloRefusal, isRequest, type Push, type Reply,
} from './remote-protocol';

// The host's side of the wire: one websocket server, one screen per connection. A connection's first
// frame must be the hello; until it passes, nothing else is read. After that every request goes into
// the channel table as that screen, and its reply goes back with the same id. A handler that throws
// answers an error frame and the socket stays open: one bad call is not a reason to drop the screen.
export type HostPorts = {
  table: Channels;
  token: () => string;
  version: string;
  onJoin(screen: string, send: (channel: string, args: unknown[]) => void): void;
  onLeave(screen: string): void;
  log(draft: LogDraft): void;
};

export type RemoteHost = { broadcast(channel: string, args: unknown[]): void; close(): void };

// No port in the settings means the host is off, and nothing listens.
export function startHostIfConfigured(port: number | null, ports: HostPorts): RemoteHost | null {
  return port === null ? null : startRemoteHost(port, ports);
}

export function startRemoteHost(port: number, ports: HostPorts): RemoteHost {
  const server = new WebSocketServer({ port });
  const screens = new Map<string, WebSocket>();
  let nextScreen = 1;

  function push(socket: WebSocket, frame: Push | Reply): void {
    if (socket.readyState === socket.OPEN) socket.send(encodeFrame(frame));
  }

  server.on('connection', (socket, request) => {
    const address = request.socket.remoteAddress ?? 'unknown';
    const screen = `screen-${nextScreen++}@${address}`;
    let joined = false;

    socket.on('message', (raw) => {
      const frame = decodeFrame(String(raw));
      if (!frame || !isRequest(frame)) return;
      if (!joined) {
        if (frame.channel !== HELLO_CHANNEL) return socket.close(4000, 'Say hello first');
        const [token, version] = frame.args as [string, string];
        const refusal = helloRefusal(token, version, ports.token(), ports.version);
        if (refusal) {
          ports.log({ level: 'warn', kind: 'screen', message: `${address} refused: ${refusal.reason}` });
          return socket.close(refusal.code, refusal.reason);
        }
        joined = true;
        screens.set(screen, socket);
        ports.log({ level: 'info', kind: 'screen', message: `${address} joined` });
        push(socket, { id: frame.id, result: null });
        return ports.onJoin(screen, (channel, args) => push(socket, { channel, args }));
      }
      // A send has no reply of its own, but the client gives every frame an id, so it gets an empty one.
      if (ports.table.kind(frame.channel) === 'on') {
        ports.table.dispatch(screen, frame.channel, frame.args);
        return push(socket, { id: frame.id, result: null });
      }
      void ports.table.invoke(screen, frame.channel, frame.args)
        .then((result) => push(socket, { id: frame.id, result }))
        .catch((error: unknown) => push(socket, { id: frame.id, error: failureText(error) }));
    });

    socket.on('close', () => {
      if (!joined) return;
      screens.delete(screen);
      ports.onLeave(screen);
      ports.log({ level: 'info', kind: 'screen', message: `${address} left` });
    });
  });

  server.on('error', (error) => {
    ports.log({ level: 'error', kind: 'screen', message: `Not listening on ${port}: ${failureText(error)}` });
  });

  return {
    broadcast(channel, args) {
      for (const socket of screens.values()) push(socket, { channel, args });
    },
    close() {
      for (const socket of screens.values()) socket.close(1001, 'Host closing');
      server.close();
    },
  };
}
