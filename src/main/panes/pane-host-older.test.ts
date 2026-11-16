import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { endOlderHost } from './pane-host-client';
import { olderHostSockets, paneHostAddress, paneKey, pipeName, prepareHostSocket } from './pane-host-protocol';
import { acceptApps } from './host-socket';
import { paneHostServer } from './pane-host-server';
import type { PaneShell } from './pane-shell';
import { temporaryFolder } from '../testing/temporary-folder';

describe('olderHostSockets', () => {
  it('names every version before this one, and none while this is the first', () => {
    expect(olderHostSockets('linux', '/data', undefined, 1)).toEqual([]);
    expect(olderHostSockets('linux', '/data', undefined, 3)).toEqual([1, 2].map((version) => path.join('/data', 'pane-host', `panes-${version}.sock`)));
    const token = 'ab'.repeat(16);
    expect(olderHostSockets('win32', '/data', token, 2)).toEqual([pipeName(token, 1)]);
    expect(olderHostSockets('win32', '/data', undefined, 2)).toEqual([]);
  });
});

// On Windows these run over a real named pipe, the way the app does there.
describe('endOlderHost', () => {
  const accepted: net.Socket[] = [];
  afterEach(() => {
    for (const socket of accepted.splice(0)) socket.destroy();
  });

  // A host with two shells kept, listening the way pane-host-entry.ts listens.
  async function olderHost() {
    const socketPath = paneHostAddress(process.platform, temporaryFolder('pane-host-older-'))?.socket ?? '';
    prepareHostSocket(process.platform, socketPath);
    const killed: string[] = [];
    const host = paneHostServer((request) => ({
      pid: 1, process: 'zsh', cols: 80, rows: 24, kill: () => killed.push(request.key),
      write: () => undefined, resize: () => undefined, pause: () => undefined, resume: () => undefined, onData: () => undefined, onExit: () => undefined,
    }) as PaneShell, () => undefined);
    for (const index of [1, 2]) host.receive({ type: 'spawn', key: paneKey('/work', index), file: 'zsh', args: [], cwd: '/work', env: {}, cols: 80, rows: 24 });
    const accept = acceptApps(host);
    const listener = net.createServer((socket) => {
      accepted.push(socket);
      accept(socket);
    });
    await new Promise<void>((resolve) => listener.listen(socketPath, resolve));
    return { socketPath, killed, listener };
  }

  it('kills every shell an older host kept', async () => {
    const { socketPath, killed, listener } = await olderHost();
    expect(await endOlderHost(socketPath)).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(killed).toEqual([paneKey('/work', 1), paneKey('/work', 2)]);
    listener.close();
  });

  // An older build still running on the same user data holds it: its panes are its own.
  it('leaves a host busy with an app of its own alone', async () => {
    const { socketPath, killed, listener } = await olderHost();
    const app = net.connect(socketPath);
    await new Promise((resolve) => app.once('connect', resolve));
    app.write('{"type":"hello"}\n');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await endOlderHost(socketPath)).toBe(0);
    expect(killed).toEqual([]);
    app.destroy();
    listener.close();
  });

  it('ends nothing where no host listens', async () => {
    expect(await endOlderHost(path.join(temporaryFolder('pane-host-older-'), 'none.sock'))).toBe(0);
  });
});
