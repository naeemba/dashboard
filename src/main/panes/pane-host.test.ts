import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hostCommand, paneHost } from './pane-host-client';
import { line, lineReader, paneHostSocket, paneKey, type FromHost, type SpawnRequest } from './pane-host-protocol';
import { acceptApps, paneHostServer } from './pane-host-server';
import type { PaneShell } from './pane-shell';

// A shell that does what the test tells it, in place of node-pty.
function fakeShell(pid: number) {
  const listeners = { data: [] as ((data: string) => void)[], exit: [] as ((event: { exitCode: number }) => void)[] };
  const written: string[] = [];
  let killed = 0;
  const shell: PaneShell = {
    pid, process: 'zsh', cols: 80, rows: 24,
    write: (data) => { written.push(data); },
    resize: () => undefined,
    kill: () => { killed += 1; },
    onData: (listener) => listeners.data.push(listener),
    onExit: (listener) => listeners.exit.push(listener),
  };
  return {
    shell, written, killed: () => killed,
    print: (data: string) => listeners.data.forEach((listener) => listener(data)),
    exit: (exitCode: number) => listeners.exit.forEach((listener) => listener({ exitCode })),
  };
}

function request(key: string): SpawnRequest {
  return { key, file: '/bin/zsh', args: [], cwd: '/work', env: {}, cols: 80, rows: 24 };
}

function server() {
  const spawned: ReturnType<typeof fakeShell>[] = [];
  let idle = 0;
  const host = paneHostServer(() => {
    const made = fakeShell(100 + spawned.length);
    spawned.push(made);
    return made.shell;
  }, () => { idle += 1; });
  return { host, spawned, idle: () => idle };
}

describe('lineReader', () => {
  it('parses a message cut across three chunks once its line is whole', () => {
    const heard: unknown[] = [];
    const read = lineReader((message) => heard.push(message));
    read('{"a":1}\n{"b"');
    expect(heard).toEqual([{ a: 1 }]);
    read(':');
    read('2}\n');
    expect(heard).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips a line that is not JSON and reads the next', () => {
    const heard: unknown[] = [];
    const read = lineReader((message) => heard.push(message));
    read('not json\n{"a":1}\n');
    expect(heard).toEqual([{ a: 1 }]);
  });
});

describe('paneHostServer', () => {
  it('drops the exit of a shell a spawn replaced, so the new one is not reported dead', () => {
    const { host, spawned } = server();
    const sent: FromHost[] = [];
    host.connect((message) => sent.push(message));
    host.receive({ type: 'spawn', ...request('k') });
    host.receive({ type: 'spawn', ...request('k') });
    spawned[0].exit(1);
    expect(spawned[0].killed()).toBe(1);
    expect(sent.filter((message) => message.type === 'exit')).toEqual([]);
    spawned[1].exit(0);
    expect(sent.at(-1)).toEqual({ type: 'exit', key: 'k', code: 0 });
  });

  it('keeps a shell running with no app connected, and tells the next app its screen', () => {
    const { host, spawned, idle } = server();
    host.connect(() => undefined);
    host.receive({ type: 'spawn', ...request('k') });
    host.disconnect();
    spawned[0].print('hello');
    const sent: FromHost[] = [];
    host.connect((message) => sent.push(message));
    expect(sent).toMatchObject([{ type: 'panes', panes: [{ key: 'k', pid: 100, file: '/bin/zsh', cwd: '/work' }] }]);
    expect(idle()).toBe(0);
  });

  it('stops once the app has gone and its last shell has ended', () => {
    const { host, spawned, idle } = server();
    host.connect(() => undefined);
    host.receive({ type: 'spawn', ...request('k') });
    host.disconnect();
    expect(idle()).toBe(0);
    spawned[0].exit(0);
    expect(idle()).toBe(1);
  });

  it('answers a shell that cannot start with the exit a missing shell gives', () => {
    const sent: FromHost[] = [];
    const host = paneHostServer(() => { throw new Error('ENOENT'); }, () => undefined);
    host.connect((message) => sent.push(message));
    host.receive({ type: 'spawn', ...request('k') });
    expect(sent.at(-1)).toEqual({ type: 'exit', key: 'k', code: 127 });
  });

  it('sends a pane\'s foreground only when it changes, and nothing with no app connected', () => {
    const { host, spawned } = server();
    const sent: FromHost[] = [];
    host.connect((message) => sent.push(message));
    host.receive({ type: 'spawn', ...request('k') });
    host.pollForeground();
    host.pollForeground();
    expect(sent.filter((message) => message.type === 'foreground')).toEqual([{ type: 'foreground', key: 'k', name: 'zsh' }]);
    host.disconnect();
    (spawned[0].shell as { process: string }).process = 'vim';
    sent.length = 0;
    host.pollForeground();
    expect(sent).toEqual([]);
  });
});

describe('hostCommand', () => {
  it('quotes a path with a quote in it for the login shell', () => {
    expect(hostCommand("/a b/it's.js", '/s.sock')).toBe("exec node '/a b/it'\\''s.js' '/s.sock'");
  });
});

describe('paneHost over a socket', () => {
  let folder = '';
  // Every connection the test host took, ended before its folder goes.
  const accepted: net.Socket[] = [];
  afterEach(() => {
    for (const socket of accepted.splice(0)) socket.destroy();
    rmSync(folder, { recursive: true, force: true });
  });

  // The host's socket, with the server above behind it, wired the way pane-host-entry.ts wires it.
  function listen(host: ReturnType<typeof paneHostServer>, socketPath: string): Promise<net.Server> {
    const accept = acceptApps(host);
    const listener = net.createServer((socket) => {
      accepted.push(socket);
      accept(socket);
    });
    return new Promise((resolve) => listener.listen(socketPath, () => resolve(listener)));
  }

  it('seeds a new host shell\'s foreground with the shell itself, not an empty name', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = path.join(folder, 'host.sock');
    const { host } = server();
    const listener = await listen(host, socketPath);
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: () => undefined });
    await client.ready;
    expect(client.spawn(request(paneKey('/project', 1))).process).toBe('/bin/zsh');
    listener.close();
  });

  it('takes back a shell the host kept, with its screen first and its typing reaching it', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = path.join(folder, 'host.sock');
    const { host, spawned } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    spawned[0].print('before the restart');
    const listener = await listen(host, socketPath);
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: (message) => lost.push(message) });
    await client.ready;
    expect(client.adopt('/elsewhere')).toEqual([]);
    const [{ shell }] = client.adopt('/project');
    expect(shell.pid).toBe(100);
    const heard = await new Promise<string>((resolve) => shell.onData(resolve));
    expect(heard).toContain('before the restart');
    expect(shell.kept).toBe(true);
    shell.write('ls\r');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spawned[0].written).toEqual(['ls\r']);
    expect(client.adopt('/project')).toEqual([]);
    listener.close();
    expect(lost).toEqual([]);
  });

  it('ends every shell it held when the host goes, and runs the next one in this process', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = path.join(folder, 'host.sock');
    const { host } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    const listener = await listen(host, socketPath);
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: (message) => lost.push(message) });
    await client.ready;
    const [{ shell }] = client.adopt('/project');
    const exited = new Promise<number>((resolve) => shell.onExit(({ exitCode }) => resolve(exitCode)));
    accepted[0].destroy();
    expect(await exited).toBe(1);
    expect(lost).toHaveLength(1);
    const next = client.spawn({ ...request(paneKey('/project', 1)), file: '/bin/sh', args: ['-c', 'exit 0'], cwd: folder, env: { PATH: process.env.PATH ?? '' } });
    expect(next.kept).toBeUndefined();
    await new Promise((resolve) => next.onExit(resolve));
    listener.close();
  });

  it('turns a second app away while one is connected, and the first keeps hearing its shells', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = path.join(folder, 'host.sock');
    const { host, spawned } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    const listener = await listen(host, socketPath);
    const first = paneHost({ socket: socketPath, launch: () => undefined, lost: () => undefined });
    await first.ready;
    const [{ shell }] = first.adopt('/project');
    const lost: string[] = [];
    const second = paneHost({ socket: socketPath, launch: () => undefined, lost: (message) => lost.push(message) });
    await second.ready;
    expect(lost[0]).toContain('Another Dashboard');
    const heard = new Promise<string>((resolve) => shell.onData((data) => { if (data.includes('still here')) resolve(data); }));
    spawned[0].print('still here');
    expect(await heard).toContain('still here');
    listener.close();
  });

  it('runs its shells itself when the host is busy with another app', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = path.join(folder, 'host.sock');
    const listener = net.createServer((socket) => {
      accepted.push(socket);
      socket.end(line({ type: 'busy' }));
    });
    await new Promise<void>((resolve) => listener.listen(socketPath, resolve));
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: (message) => lost.push(message) });
    await client.ready;
    expect(lost).toHaveLength(1);
    expect(lost[0]).toContain('Another Dashboard');
    expect(client.spawn({ ...request(paneKey('/project', 1)), file: '/bin/sh', args: ['-c', 'exit 0'], cwd: folder, env: { PATH: process.env.PATH ?? '' } }).kept).toBeUndefined();
    listener.close();
  });

  it('runs shells in this process when no host answers', async () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    let launched = 0;
    const lost: string[] = [];
    const client = paneHost({ socket: paneHostSocket(folder), launch: () => { launched += 1; }, lost: (message) => lost.push(message) });
    await client.ready;
    expect(launched).toBe(1);
    expect(lost).toHaveLength(1);
    const shell = client.spawn({ ...request(paneKey('/project', 1)), file: '/bin/sh', args: ['-c', 'exit 3'], cwd: folder, env: { PATH: process.env.PATH ?? '' } });
    expect(shell.kept).toBeUndefined();
    const code = await new Promise<number>((resolve) => shell.onExit(({ exitCode }) => resolve(exitCode)));
    expect(code).toBe(3);
  }, 10_000);
});
