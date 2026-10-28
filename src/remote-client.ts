import WebSocket from 'ws';
import type { RemoteTarget } from './channels';
import type { LogDraft } from './log-entry';
import { pendingRequests } from './pending-requests';
import {
  HELLO_CHANNEL, REQUEST_TIMEOUT_MS, decodeFrame, encodeFrame, isReply, type Frame,
} from './remote-protocol';

// This screen's side of the wire. One socket to the host; every request gets an id and a timer, every
// push goes to the renderer as if main had sent it. A socket that drops after the first accepted hello
// is retried every two seconds, and the host replays each pane on the way back in.
export type ClientPorts = {
  version: string;
  push(channel: string, args: unknown[]): void;
  status(text: string): void;
  log(draft: LogDraft): void;
};

export type RemoteClient = RemoteTarget & {
  address: string;
  invoke(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  close(): void;
};

const RECONNECT_MS = 2_000;

export function connectRemote(address: string, token: string, ports: ClientPorts): Promise<RemoteClient> {
  const pending = pendingRequests();
  let socket: WebSocket | null = null;
  let nextId = 1;
  let closed = false;
  // Set by the first accepted hello. Before it a failure is the caller's to hear; after it, a retry's.
  let everAccepted = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function send(frame: Frame): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(encodeFrame(frame));
    return true;
  }

  function request(channel: string, args: unknown[], timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      if (!send({ id, channel, args })) return reject(new Error(`Not connected to ${address}`));
      // The timer is cleared once the request settles, so a busy session leaves no timers behind.
      const timer = setTimeout(() => pending.expire(id, address), timeoutMs);
      timer.unref();
      pending.open(id, (value: unknown) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }

  // Opens a socket and says hello. Resolves once the host accepts; rejects with the host's reason.
  function open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const next = new WebSocket(`ws://${address}`);
      next.on('open', () => {
        if (closed) return next.close();
        socket = next;
        request(HELLO_CHANNEL, [token, ports.version], REQUEST_TIMEOUT_MS).then(() => {
          everAccepted = true;
          ports.status('');
          resolve();
        }, reject);
      });
      next.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame) return;
        if (isReply(frame)) pending.settle(frame);
        else if ('channel' in frame) ports.push(frame.channel, frame.args);
      });
      next.on('error', (error) => { if (!everAccepted) reject(error); });
      next.on('close', (_code, reason) => {
        if (socket === next) socket = null;
        // Before the failAll, so the host's own reason beats the generic one the hello would get.
        if (!everAccepted) reject(new Error(reason.toString() || `Could not reach ${address}`));
        pending.failAll(`Lost ${address}`);
        if (!everAccepted || closed) return;
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
      send({ id: nextId++, channel, args });
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close(1000, 'Disconnected');
      ports.status('');
    },
  }));
}
