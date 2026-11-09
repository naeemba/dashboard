import { existsSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimHostSocket } from './host-socket';
import { temporaryFolder } from '../testing/temporary-folder';

describe.skipIf(process.platform === 'win32')('claimHostSocket', () => {
  it('leaves the socket to a host that answers on it, and takes one nothing answers on', async () => {
    const socket = path.join(temporaryFolder('host-socket-'), 'screen-host', 'screens-1.sock');
    let before = 0;
    const ending = (): void => { before += 1; };
    expect(await claimHostSocket(process.platform, socket, ending)).toBe(true);
    const live = net.createServer((each) => each.destroy());
    await new Promise<void>((resolve) => live.listen(socket, resolve));
    expect(await claimHostSocket(process.platform, socket, ending)).toBe(false);
    expect(existsSync(socket)).toBe(true);
    await new Promise((resolve) => live.close(resolve));
    writeFileSync(socket, '');
    expect(await claimHostSocket(process.platform, socket, ending)).toBe(true);
    expect(existsSync(socket)).toBe(false);
    expect(before).toBe(2);
  });
});
