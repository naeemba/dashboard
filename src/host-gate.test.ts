import { describe, expect, it } from 'vitest';
import { closeReason, gateFrame } from './host-gate';
import { startHostIfConfigured, type HostPorts } from './remote-host';

const hello = (token: string, version: string) => ({ id: 1, channel: 'host:hello', args: [token, version] });

describe('gateFrame', () => {
  it('closes 4000 on a push, a reply, junk or another channel before hello', () => {
    for (const frame of [null, { channel: 'x', args: [] }, { id: 1, result: null }, { id: 1, channel: 'pty:input', args: [] }]) {
      expect(gateFrame(false, frame, 't', '1')).toMatchObject({ action: 'close', code: 4000 });
    }
  });
  it('closes 4001 on a wrong token and 4002 on a wrong version', () => {
    expect(gateFrame(false, hello('no', '1'), 't', '1')).toMatchObject({ action: 'close', code: 4001 });
    expect(gateFrame(false, hello('t', '2'), 't', '1')).toMatchObject({ action: 'close', code: 4002 });
  });
  it('joins on a good hello', () => {
    expect(gateFrame(false, hello('t', '1'), 't', '1')).toEqual({ action: 'join', id: 1 });
  });
  it('serves requests and ignores pushes once joined', () => {
    const request = { id: 2, channel: 'pty:input', args: [] };
    expect(gateFrame(true, request, 't', '1')).toEqual({ action: 'serve', request });
    expect(gateFrame(true, { channel: 'x', args: [] }, 't', '1')).toEqual({ action: 'ignore' });
  });
  it("refuses the screen's own channels with an error reply once joined", () => {
    for (const channel of ['settings:write', 'link:open', 'notification:show', 'host:connect']) {
      expect(gateFrame(true, { id: 3, channel, args: [] }, 't', '1'))
        .toEqual({ action: 'refuse', id: 3, error: `Not served to a remote screen: ${channel}` });
    }
  });
});

describe('closeReason', () => {
  it('cuts to 123 bytes and leaves a short one alone', () => {
    expect(closeReason('short')).toBe('short');
    expect(Buffer.byteLength(closeReason('é'.repeat(100)))).toBeLessThanOrEqual(123);
  });
});

describe('startHostIfConfigured', () => {
  it('starts nothing without a port', () => {
    const untouched = new Proxy({}, { get: () => { throw new Error('touched'); } }) as HostPorts;
    expect(startHostIfConfigured(null, untouched)).toBeNull();
  });
});
