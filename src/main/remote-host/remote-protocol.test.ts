import { describe, expect, it } from 'vitest';
import {
  CLOSE_BAD_TOKEN, CLOSE_BAD_VERSION, decodeFrame, encodeFrame, helloRefusal, isClientChannel, isReply, isRequest,
} from './remote-protocol';

describe('frames', () => {
  it('round-trips a request, a reply and a push', () => {
    const request = { id: 1, channel: 'board:read', args: ['/code/api'] };
    const reply = { id: 1, result: { ok: true } };
    const push = { channel: 'pty:data', args: ['0-1', 'hello'] };
    for (const frame of [request, reply, push]) expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
  });

  it('keeps a reply with no result as a null result on the wire', () => {
    expect(decodeFrame(encodeFrame({ id: 1, result: undefined }))).toEqual({ id: 1, result: null });
  });

  it('tells the three apart', () => {
    expect(isRequest({ id: 1, channel: 'x:y', args: [] })).toBe(true);
    expect(isReply({ id: 1, result: null })).toBe(true);
    expect(isReply({ id: 1, error: 'no' })).toBe(true);
    expect(isRequest({ channel: 'x:y', args: [] })).toBe(false);
    expect(isReply({ channel: 'x:y', args: [] })).toBe(false);
  });

  it('answers null for text that is not a frame', () => {
    expect(decodeFrame('not json')).toBeNull();
    expect(decodeFrame('{"id":1}')).toBeNull();
    expect(decodeFrame('{"channel":"x","args":"not a list"}')).toBeNull();
  });
});

describe('isClientChannel', () => {
  it('keeps what belongs to the screen on the screen', () => {
    for (const channel of [
      'link:open', 'notification:show', 'settings:read', 'settings:write', 'host:connect', 'host:disconnect', 'session:restored',
      'markets:read',
    ]) {
      expect(isClientChannel(channel)).toBe(true);
    }
  });

  it('sends everything else to the host', () => {
    for (const channel of ['pty:input', 'board:read', 'scrollback:open', 'file:open', 'projects:open', 'log:read']) {
      expect(isClientChannel(channel)).toBe(false);
    }
  });
});

describe('helloRefusal', () => {
  it('accepts the right token and version', () => {
    expect(helloRefusal('t', '1.17.0', 't', '1.17.0')).toBeNull();
  });

  it('refuses a wrong token before it looks at the version', () => {
    expect(helloRefusal('x', '1.0.0', 't', '1.17.0')).toEqual({ code: CLOSE_BAD_TOKEN, reason: 'The host refused the token' });
  });

  it('names both versions when they differ', () => {
    expect(helloRefusal('t', '1.16.0', 't', '1.17.0')).toEqual({
      code: CLOSE_BAD_VERSION, reason: 'The host runs Dashboard 1.17.0, this is 1.16.0',
    });
  });
});
