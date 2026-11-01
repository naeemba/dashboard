import {
  CLOSE_NO_HELLO, HELLO_CHANNEL, helloRefusal, isClientChannel, isRequest, type Frame, type Request,
} from './remote-protocol';

// What the host does with one frame from one connection. Until the hello has passed, nothing but a
// valid hello is read; once joined, requests are served and anything else is dropped. A request on a
// channel that belongs to the screen is answered with an error and never reaches the table: a screen
// must not write the desk's keys and shell, open the desk's browser, raise a banner on it, or turn the
// desk itself into a screen of some other host.
export type GateAnswer =
  | { action: 'close'; code: number; reason: string }
  | { action: 'join'; id: number }
  | { action: 'serve'; request: Request }
  | { action: 'refuse'; id: number; error: string }
  | { action: 'ignore' };

export function gateFrame(
  joined: boolean, frame: Frame | null, expectedToken: string, expectedVersion: string,
): GateAnswer {
  if (joined) {
    if (!frame || !isRequest(frame)) return { action: 'ignore' };
    if (isClientChannel(frame.channel)) {
      return { action: 'refuse', id: frame.id, error: `Not served to a remote screen: ${frame.channel}` };
    }
    return { action: 'serve', request: frame };
  }
  if (!frame || !isRequest(frame) || frame.channel !== HELLO_CHANNEL) {
    return { action: 'close', code: CLOSE_NO_HELLO, reason: 'Say hello first' };
  }
  const [token, version] = frame.args;
  const refusal = helloRefusal(String(token), String(version), expectedToken, expectedVersion);
  return refusal ? { action: 'close', ...refusal } : { action: 'join', id: frame.id };
}

// A websocket close reason is at most 123 bytes, and the version one carries the client's own string.
export function closeReason(reason: string): string {
  let kept = '';
  for (const character of reason) {
    if (Buffer.byteLength(kept + character) > 123) break;
    kept += character;
  }
  return kept;
}
