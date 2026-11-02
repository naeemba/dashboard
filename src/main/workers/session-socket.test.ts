import { mkdtempSync, rmSync, statSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { askApp, listenForSessions, sessionSocketFolder, sessionSocketPath } from './session-socket';

// Every folder a test makes, removed after it.
const made: string[] = [];
const folder = (prefix: string) => {
  const madeFolder = mkdtempSync(path.join(tmpdir(), prefix));
  made.push(madeFolder);
  return madeFolder;
};
afterEach(() => {
  for (const each of made.splice(0)) rmSync(each, { recursive: true, force: true });
});

describe('sessionSocketPath', () => {
  // The folder is the lock: only you can enter it, so only you can reach the socket inside.
  // Skipped on Windows, which has no POSIX file modes to read back.
  const posixModesOnly = it.skipIf(process.platform === 'win32');
  posixModesOnly('puts the socket in a fresh folder only this user can enter', () => {
    const temporary = folder('socket-test-');
    const socket = sessionSocketPath('linux', temporary, 42);
    expect(path.basename(socket)).toBe('session.sock');
    expect(statSync(path.dirname(socket)).mode & 0o077).toBe(0);
    expect(sessionSocketPath('linux', temporary, 42)).not.toBe(socket);
  });

  it('names a pipe after the process on Windows', () => {
    expect(sessionSocketPath('win32', 'C:\\Temp', 42)).toBe('\\\\.\\pipe\\dashboard-session-42');
  });

  // Quitting removes this folder recursively, so it is only ever the one made for the socket.
  it('names the folder it made for the socket, and none for a pipe', () => {
    const temporary = folder('socket-test-');
    const socket = sessionSocketPath('linux', temporary, 42);
    expect(sessionSocketFolder('linux', socket)).toBe(path.dirname(socket));
    // A child of the temporary folder, never the folder itself, or quitting would empty /tmp.
    expect(path.dirname(sessionSocketFolder('linux', socket)!)).toBe(temporary);
    expect(sessionSocketFolder('win32', sessionSocketPath('win32', 'C:\\Temp', 42))).toBeNull();
  });
});

describe('listenForSessions and askApp', () => {
  // A Windows named pipe does not stay half open: a command that ended its side to say the request was
  // whole closed the whole pipe, the answer went nowhere, and every `pane` command printed "the app
  // answered with something that was not a reply". On win32 this round trip runs over that real pipe.
  it('carries a request to the app and its answer back', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, async (request) => ({ ok: true, output: `${request.directory} ${request.args.join(' ')}` }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['claim'] })).toEqual({ ok: true, output: '/work/api claim' });
    server.close();
  });

  // An answer that throws, or a request of the wrong shape, still gets the command a reply.
  halfOpenOnly('answers a request it cannot handle rather than leaving the command waiting', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, async () => { throw new Error('no such pane'); }, () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['claim'] })).toEqual({ ok: false, output: 'no such pane' });
    expect(await askApp(socket, { directory: 7, args: 'claim' } as never)).toMatchObject({ ok: false });
    server.close();
  });

  // A command killed halfway through writing its request closes before the newline. It is refused like
  // any request the app cannot read, not answered from half a line. Only where a socket stays half open
  // is there anyone left to read the refusal, so a Windows pipe skips this.
  it.skipIf(process.platform === 'win32')('refuses a request cut off before its newline', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, async () => ({ ok: true, output: 'answered' }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    const reply = await new Promise<string>((resolve) => {
      let text = '';
      const connection = net.connect({ path: socket, allowHalfOpen: true }, () => connection.end('{"directory":"/work/api","ar'));
      connection.setEncoding('utf8');
      connection.on('data', (chunk: string) => { text += chunk; });
      connection.on('end', () => resolve(text));
    });
    expect(JSON.parse(reply)).toEqual({ ok: false, output: 'the request was not one the app could read' });
    server.close();
  });

  it('says the app is gone when nothing is listening', async () => {
    const reply = await askApp(path.join(folder('socket-test-'), 'none.sock'), { directory: '/', args: [] });
    expect(reply).toMatchObject({ ok: false, output: expect.stringContaining('is not answering') });
  });
});
