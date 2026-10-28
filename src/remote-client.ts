import WebSocket from 'ws';
import type { RemoteTarget } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import { pendingRequests } from './pending-requests';
import { sentSizes } from './sent-sizes';
import {
  CLOSE_BAD_TOKEN, CLOSE_BAD_VERSION, HELLO_CHANNEL, REQUEST_TIMEOUT_MS, decodeFrame, encodeFrame, isReply, type Frame,
} from './remote-protocol';

// This screen's side of the wire. One socket to the host; every request gets an id and a timer, every
// push goes to the renderer as if main had sent it. A socket that drops after the first accepted hello
// is retried every two seconds, and the host replays each pane on the way back in.
export type ClientPorts = {
  version: string;
  push(channel: string, args: unknown[]): void;
  status(text: string): void;
  log(draft: LogDraft): void;
  // The host refused a reconnect, so this client has stopped trying and will never carry a request again.
  gone(): void;
};

export type RemoteClient = RemoteTarget & {
  address: string;
  invoke(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  close(): void;
};

const RECONNECT_MS = 2_000;

// helloTimeoutMs exists for the test of a host that never answers the hello, or never opens the socket.
export function connectRemote(
  address: string, token: string, ports: ClientPorts, helloTimeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<RemoteClient> {
  const pending = pendingRequests();
  const sizes = sentSizes();
  let socket: WebSocket | null = null;
  let nextId = 1;
  let closed = false;
  // Set by the first accepted hello. Before it a failure is the caller's to hear; after it, a retry's.
  let everAccepted = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  // The socket whose hello is out. close() cannot reach it through `socket`, which goes live only on acceptance.
  let connecting: WebSocket | null = null;

  // `via` is the socket that is saying hello and is not the live one yet.
  function send(frame: Frame, via: WebSocket | null = socket): boolean {
    if (!via || via.readyState !== WebSocket.OPEN) return false;
    via.send(encodeFrame(frame));
    return true;
  }

  function request(channel: string, args: unknown[], timeoutMs: number, via: WebSocket | null = socket): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      if (!send({ id, channel, args }, via)) return reject(new Error(`Not connected to ${address}`));
      // The timer is cleared once the request settles, so a busy session leaves no timers behind.
      const timer = setTimeout(() => pending.expire(id, address), timeoutMs);
      timer.unref();
      pending.open(id, (value: unknown) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }

  // Opens a socket and says hello. Resolves once the host accepts; rejects with the host's reason.
  function open(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Without a handshake timeout a mistyped address waits out the system's TCP timeout, over a minute
      // with nothing on the screen, and so does every retry of a host that has gone.
      const next = new WebSocket(`ws://${address}`, { handshakeTimeout: helloTimeoutMs });
      connecting = next;
      next.on('open', () => {
        if (closed) return next.close();
        // The socket goes live only once the host accepts: until then nothing else may travel over it.
        request(HELLO_CHANNEL, [token, ports.version], helloTimeoutMs, next).then(() => {
          connecting = null;
          if (closed) {
            next.terminate();
            return resolve();
          }
          socket = next;
          if (everAccepted) {
            ports.log({ level: 'info', kind: 'screen', message: `reconnected to ${address}` });
            for (const args of sizes.all()) send({ id: nextId++, channel: 'pty:resize', args });
          }
          everAccepted = true;
          ports.status('');
          resolve();
        }, (error: unknown) => {
          // A hello that was refused or never answered leaves no socket behind to push into the renderer.
          connecting = null;
          next.terminate();
          reject(error);
        });
      });
      next.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame || closed) return;
        if (isReply(frame)) pending.settle(frame);
        else if ('channel' in frame) ports.push(frame.channel, frame.args);
      });
      next.on('error', (error) => { if (!everAccepted) reject(new Error(`Could not reach ${address}: ${failureText(error)}`)); });
      next.on('close', (code, reason) => {
        if (socket === next) socket = null;
        // Before the failAll, so the host's own reason beats the generic one the hello would get.
        if (!everAccepted) reject(new Error(reason.toString() || `Could not reach ${address}`));
        pending.failAll(`Lost ${address}`);
        if (!everAccepted || closed) return;
        // A refusal will be the same on the next try; say why and stop rather than loop on a stale token.
        if (code === CLOSE_BAD_TOKEN || code === CLOSE_BAD_VERSION) {
          ports.status(reason.toString());
          ports.log({ level: 'error', kind: 'screen', message: `${address} refused the reconnect: ${reason.toString()}` });
          return ports.gone();
        }
        ports.log({ level: 'warn', kind: 'screen', message: `lost ${address}` });
        ports.status(`Reconnecting to ${address}…`);
        reconnectTimer = setTimeout(() => void open().catch(() => undefined), RECONNECT_MS);
      });
    });
  }

  return open().then((): RemoteClient => ({
    address,
    invoke: (channel: string, args: unknown[], timeoutMs: number = REQUEST_TIMEOUT_MS) => request(channel, args, timeoutMs),
    send(channel, args) {
      // Dropped when down, never queued: a queued `rm` landing a minute late is worse than a lost key.
      // A size is the exception that is kept, to be told again on the way back in.
      sizes.remember(channel, args);
      send({ id: nextId++, channel, args });
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connecting?.terminate();
      socket?.close(1000, 'Disconnected');
      ports.status('');
    },
  }));
}
