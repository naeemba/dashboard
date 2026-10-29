import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { askApp, listenForSessions, sessionSocketPath } from './session-socket';

describe('sessionSocketPath', () => {
  // The folder is the lock: only you can enter it, so only you can reach the socket inside.
  it('puts the socket in a fresh folder only this user can enter', () => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'socket-test-'));
    const socket = sessionSocketPath('linux', temporary, 42);
    expect(path.basename(socket)).toBe('session.sock');
    expect(statSync(path.dirname(socket)).mode & 0o077).toBe(0);
    expect(sessionSocketPath('linux', temporary, 42)).not.toBe(socket);
  });

  it('names a pipe after the process on Windows', () => {
    expect(sessionSocketPath('win32', 'C:\\Temp', 42)).toBe('\\\\.\\pipe\\dashboard-session-42');
  });
});

describe('listenForSessions and askApp', () => {
  it('carries a request to the app and its answer back', async () => {
    const socket = sessionSocketPath(process.platform, tmpdir(), process.pid);
    const server = listenForSessions(socket, async (request) => ({ ok: true, output: `${request.directory} ${request.args.join(' ')}` }), () => undefined);
    await new Promise((resolve) => server.once('listening', resolve));
    expect(await askApp(socket, { directory: '/work/api', args: ['claim'] })).toEqual({ ok: true, output: '/work/api claim' });
    server.close();
  });

  it('says the app is gone when nothing is listening', async () => {
    const reply = await askApp(path.join(mkdtempSync(path.join(tmpdir(), 'socket-test-')), 'none.sock'), { directory: '/', args: [] });
    expect(reply).toMatchObject({ ok: false, output: expect.stringContaining('is not answering') });
  });
});
