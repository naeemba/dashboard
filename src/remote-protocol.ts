import { isRecord } from './is-record';

// The wire between a screen and the host: the bridge's own channels, one JSON frame per
// message. A request carries an id so its reply finds it; a push has none. Shared by remote-host.ts and
// remote-client.ts so neither holds its own idea of the shape.
export type Request = { id: number; channel: string; args: unknown[] };
export type Reply = { id: number; result?: unknown; error?: string };
export type Push = { channel: string; args: unknown[] };
export type Frame = Request | Reply | Push;

export const HELLO_CHANNEL = 'host:join';
// Close codes a client reads to say why it was refused. 4000 and up are an application's own.
export const CLOSE_BAD_TOKEN = 4001;
export const CLOSE_BAD_VERSION = 4002;
export const REQUEST_TIMEOUT_MS = 10_000;
// A connection that has not said hello by now is closed: a socket that never speaks is not a screen.
export const HELLO_TIMEOUT_MS = 5_000;
export const CLOSE_NO_HELLO = 4000;
// How often the host pings each screen. A screen that has not answered the last ping by the next one
// is gone (a mac asleep, a wifi that dropped) even though its socket never closed, and is dropped.
export const HEARTBEAT_MS = 10_000;
// The largest frame the host reads. A screen's biggest is a whole board or page of notes; ws's own
// default of 100 MB would let a connection that has not said hello make main parse that much.
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

// What never leaves the screen: a link opens in the browser you are looking at, a banner shows on the
// desk you are sitting at, and the settings (keys, font, theme) are this machine's. A mac on a Linux
// host must keep its Cmd bindings. The weather and prices on the manager are read with this machine's
// Place, and do not depend on whose session is shown. Connecting and disconnecting are the client's own by definition, and
// so is the window saying it has restored its own session, which is what `--remote` waits for.
const CLIENT_CHANNELS = new Set([
  'link:open', 'notification:show', 'settings:read', 'settings:write', 'host:connect', 'host:disconnect',
  'session:restored', 'markets:read',
]);

export function isClientChannel(channel: string): boolean {
  return CLIENT_CHANNELS.has(channel);
}

// JSON drops an undefined field, so a reply that answers nothing would arrive with no result at all.
// A fire-and-forget handler answers undefined; it goes out as null so the client's reply still lands.
export function encodeFrame(frame: Frame): string {
  if (isReply(frame) && frame.result === undefined && frame.error === undefined) {
    return JSON.stringify({ ...frame, result: null });
  }
  return JSON.stringify(frame);
}

export function decodeFrame(text: string): Frame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const hasId = typeof parsed.id === 'number';
  const hasChannel = typeof parsed.channel === 'string';
  const hasArgs = Array.isArray(parsed.args);
  if (hasChannel && hasArgs) return parsed as unknown as Request | Push;
  if (hasId && !hasChannel && ('result' in parsed || 'error' in parsed)) return parsed as unknown as Reply;
  return null;
}

export function isRequest(frame: Frame): frame is Request {
  return 'id' in frame && 'channel' in frame;
}

export function isReply(frame: Frame): frame is Reply {
  return 'id' in frame && !('channel' in frame);
}

// The host's answer to a hello. The token is checked first: a wrong token learns nothing about the
// host, not even its version. The versions must match because the protocol is the bridge itself, and
// two builds can disagree about an argument's shape.
export function helloRefusal(
  token: string, version: string, expectedToken: string, expectedVersion: string,
): { code: number; reason: string } | null {
  // Plain !== is accepted: the host listens on a home network, and the token is the only gate.
  if (token !== expectedToken) return { code: CLOSE_BAD_TOKEN, reason: 'The host refused the token' };
  if (version !== expectedVersion) {
    return { code: CLOSE_BAD_VERSION, reason: `The host runs Dashboard ${expectedVersion}, this is ${version}` };
  }
  return null;
}
