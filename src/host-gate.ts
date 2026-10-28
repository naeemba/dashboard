import {
  CLOSE_NO_HELLO, HELLO_CHANNEL, helloRefusal, isRequest, type Frame, type Request,
} from './remote-protocol';

// What the host does with one frame from one connection. Until the hello has passed, nothing but a
// valid hello is read; once joined, requests are served and anything else is dropped.
export type GateAnswer =
  | { action: 'close'; code: number; reason: string }
  | { action: 'join'; id: number }
  | { action: 'serve'; request: Request }
  | { action: 'ignore' };

export function gateFrame(
  joined: boolean, frame: Frame | null, expectedToken: string, expectedVersion: string,
): GateAnswer {
  if (joined) return frame && isRequest(frame) ? { action: 'serve', request: frame } : { action: 'ignore' };
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
