import { mkdtempSync, rmSync, statSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unacceptedLine, versionRefusal } from './app-handshake';
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
  const VERSION = '1.4.0+372685450abc';

  // A Windows named pipe does not stay half open: a command that ended its side to say the request was
  // whole closed the whole pipe, the answer went nowhere, and every `pane` command printed "the app
  // answered with something that was not a reply". On win32 this round trip runs over that real pipe.
  it('carries a request to the app and its answer back', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, VERSION, async (request) => ({ ok: true, output: `${request.directory} ${request.args.join(' ')}` }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['claim'], version: VERSION })).toEqual({ ok: true, output: '/work/api claim' });
    server.close();
  });

  // An answer that throws, or a request of the wrong shape, still gets the command a reply.
  it('answers a request it cannot handle rather than leaving the command waiting', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, VERSION, async () => { throw new Error('no such pane'); }, () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['claim'], version: VERSION })).toEqual({ ok: false, output: 'no such pane' });
    expect(await askApp(socket, { directory: 7, args: 'claim' } as never)).toMatchObject({ ok: false });
    server.close();
  });

  // A command killed halfway through writing its request closes before the newline. It is refused like
  // any request the app cannot read, not answered from half a line. Only where a socket stays half open
  // is there anyone left to read the refusal, so a Windows pipe skips this.
  it.skipIf(process.platform === 'win32')('refuses a request cut off before its newline', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, VERSION, async () => ({ ok: true, output: 'answered' }), () => undefined);
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

  // A rebuild puts a new command under an app still running the old build. Refused by the app, so the
  // command says to restart rather than acting on words the two builds might read differently.
  it('refuses a command of another build, or one too old to say', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, VERSION, async () => ({ ok: true, output: 'answered' }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['list'], version: '1.5.0+aaaaaaaaaaaa' }))
      .toEqual({ ok: false, output: versionRefusal(VERSION, '1.5.0+aaaaaaaaaaaa', ['list']) });
    expect(await askApp(socket, { directory: '/work/api', args: ['list'] }))
      .toEqual({ ok: false, output: versionRefusal(VERSION, undefined, ['list']) });
    server.close();
  });

  // A command from before #196 ended its whole request by closing its side, with no newline. It is
  // told to restart like any other build, not that its request could not be read.
  it.skipIf(process.platform === 'win32')('refuses a half-closed whole request as another build', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = listenForSessions(socket, VERSION, async () => ({ ok: true, output: 'answered' }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    const reply = await new Promise<string>((resolve) => {
      let text = '';
      const connection = net.connect({ path: socket, allowHalfOpen: true }, () => connection.end(JSON.stringify({ directory: '/work/api', args: ['list'] })));
      connection.setEncoding('utf8');
      connection.on('data', (chunk: string) => { text += chunk; });
      connection.on('end', () => resolve(text));
    });
    expect(JSON.parse(reply)).toEqual({ ok: false, output: versionRefusal(VERSION, undefined, ['list']) });
    server.close();
  });

  // The old app waited for the command to close its side, which this command never does: neither moved
  // and `pane list` hung for good. An app that never answers is that app.
  it('stops waiting on an app that never takes the request', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const server = net.createServer(() => undefined);
    server.listen(socket);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['list'], version: VERSION }, 50))
      .toEqual({ ok: false, output: unacceptedLine(50) });
    server.close();
  });

  // Only the acceptance is timed: an answer that takes longer than that, such as a worktree being made,
  // still arrives.
  it('waits past the timeout for an answer the app has taken', async () => {
    const socket = sessionSocketPath(process.platform, folder('socket-test-'), process.pid);
    const slow = () => new Promise<{ ok: boolean; output: string }>((resolve) => setTimeout(() => resolve({ ok: true, output: 'made' }), 150));
    const server = listenForSessions(socket, VERSION, slow, () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['run'], version: VERSION }, 50)).toEqual({ ok: true, output: 'made' });
    server.close();
  });

  it('says the app is gone when nothing is listening', async () => {
    const reply = await askApp(path.join(folder('socket-test-'), 'none.sock'), { directory: '/', args: [] });
    expect(reply).toMatchObject({ ok: false, output: expect.stringContaining('is not answering') });
  });
});
