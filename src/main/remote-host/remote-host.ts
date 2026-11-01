import { WebSocketServer, type WebSocket } from 'ws';
import type { Channels } from '../app/channels';
import { failureText } from '../../shared/errors/failure';
import type { LogDraft } from '../../shared/app/log-entry';
import { closeReason, gateFrame } from './host-gate';
import {
  CLOSE_NO_HELLO, HEARTBEAT_MS, HELLO_TIMEOUT_MS, MAX_FRAME_BYTES, decodeFrame, encodeFrame, type Push, type Reply,
} from './remote-protocol';

// The host's side of the wire: one websocket server, one screen per connection. A connection's first
// frame must be the hello; until it passes, nothing else is read. After that every request goes into
// the channel table as that screen, and its reply goes back with the same id. A handler that throws
// answers an error frame and the socket stays open: one bad call is not a reason to drop the screen.
export type HostPorts = {
  table: Channels;
  token: () => string;
  version: string;
  onJoin(screen: string, send: (channel: string, channelArguments: unknown[]) => void): void;
  onLeave(screen: string): void;
  log(draft: LogDraft): void;
  // For a failure nobody asked for, which only the status bar can tell: a port that could not be opened.
  hold(message: string): void;
};

// `except` is a screen that is not told, because it is the one that caused the push.
export type RemoteHost = { broadcast(channel: string, channelArguments: unknown[], except?: string): void; close(): void };

// `bind` is the interface it listens on: 127.0.0.1 unless the settings file says otherwise, because a
// joined screen can type into every shell and the wire is plain ws (remote-host-decision-3).
// heartbeatMs exists for the test of a screen that stops answering.
export function startRemoteHost(
  port: number, bind: string, ports: HostPorts, heartbeatMs: number = HEARTBEAT_MS,
): RemoteHost {
  const server = new WebSocketServer({ port, host: bind, maxPayload: MAX_FRAME_BYTES });
  const screens = new Map<string, WebSocket>();
  // The screens that have answered since the last ping. A close comes only when a write fails after
  // the kernel's retransmission timeout, or never on a quiet pane, and until then a sleeping mac's
  // smaller size keeps every shell shrunk and its share of the output piles up in main.
  const answered = new WeakSet<WebSocket>();
  let nextScreen = 1;

  const heartbeat = setInterval(() => {
    for (const socket of screens.values()) {
      if (!answered.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  function push(socket: WebSocket, frame: Push | Reply): void {
    if (socket.readyState === socket.OPEN) socket.send(encodeFrame(frame));
  }

  server.on('connection', (socket, request) => {
    const address = request.socket.remoteAddress ?? 'unknown';
    const screen = `screen-${nextScreen++}@${address}`;
    let joined = false;

    // No hello in time and the connection is not a screen.
    const helloTimer = setTimeout(() => socket.close(CLOSE_NO_HELLO, 'No hello'), HELLO_TIMEOUT_MS);

    // ws emits error for a malformed frame or invalid UTF-8; unhandled, Node throws.
    socket.on('error', (error) => {
      ports.log({ level: 'warn', kind: 'screen', message: `${address}: ${failureText(error)}` });
    });

    socket.on('pong', () => answered.add(socket));

    socket.on('message', (raw) => {
      const answer = gateFrame(joined, decodeFrame(String(raw)), ports.token(), ports.version);
      if (answer.action === 'ignore') return;
      if (answer.action === 'close') {
        ports.log({ level: 'warn', kind: 'screen', message: `${address} refused: ${answer.reason}` });
        return socket.close(answer.code, closeReason(answer.reason));
      }
      if (answer.action === 'refuse') return push(socket, { id: answer.id, error: answer.error });
      if (answer.action === 'join') {
        joined = true;
        clearTimeout(helloTimer);
        screens.set(screen, socket);
        answered.add(socket);
        ports.log({ level: 'info', kind: 'screen', message: `${address} joined` });
        push(socket, { id: answer.id, result: null });
        return ports.onJoin(screen, (channel, channelArguments) => push(socket, { channel, args: channelArguments }));
      }
      const frame = answer.request;
      void ports.table.invoke(screen, frame.channel, frame.args)
        .then((result) => push(socket, { id: frame.id, result }))
        .catch((error: unknown) => push(socket, { id: frame.id, error: failureText(error) }));
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!joined) return;
      screens.delete(screen);
      ports.onLeave(screen);
      ports.log({ level: 'info', kind: 'screen', message: `${address} left` });
    });
  });

  server.on('listening', () => {
    ports.log({ level: 'info', kind: 'screen', message: `Listening on ${bind}:${port}` });
  });

  server.on('error', (error) => {
    const message = `Not listening on ${bind}:${port}: ${failureText(error)}`;
    ports.log({ level: 'error', kind: 'screen', message });
    ports.hold(message);
  });

  return {
    broadcast(channel, channelArguments, except) {
      for (const [screen, socket] of screens) if (screen !== except) push(socket, { channel, args: channelArguments });
    },
    close() {
      clearInterval(heartbeat);
      for (const socket of screens.values()) socket.close(1001, 'Host closing');
      server.close();
    },
  };
}
