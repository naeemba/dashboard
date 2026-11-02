import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hostCommand, paneHost } from './pane-host-client';
import { line, lineReader, paneHostSocket, paneKey, type FromHost, type SpawnRequest, type ToHost } from './pane-host-protocol';
import { paneHostServer } from './pane-host-server';
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
  it('parses a message cut across two chunks once its line is whole', () => {
    const heard: unknown[] = [];
    const read = lineReader((message) => heard.push(message));
    read('{"a":1}\n{"b"');
    expect(heard).toEqual([{ a: 1 }]);
    read(':2}\n');
    expect(heard).toEqual([{ a: 1 }, { b: 2 }]);
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
});

describe('hostCommand', () => {
  it('quotes a path with a quote in it for the login shell', () => {
    expect(hostCommand("/a b/it's.js", '/s.sock')).toBe("exec node '/a b/it'\\''s.js' '/s.sock'");
  });
});

describe('paneHost over a socket', () => {
  let folder = '';
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  // The host's socket, with the server above behind it, as pane-host-entry.ts puts it.
  function listen(host: ReturnType<typeof paneHostServer>, socketPath: string): Promise<net.Server> {
    const listener = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', lineReader<ToHost>((message) => host.receive(message)));
      socket.on('close', () => host.disconnect());
      host.connect((message) => socket.write(line(message)));
    });
    return new Promise((resolve) => listener.listen(socketPath, () => resolve(listener)));
  }

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
    expect(client.survivors('/elsewhere')).toEqual([]);
    const [survivor] = client.survivors('/project');
    const shell = client.adopt(survivor.key);
    expect(shell?.pid).toBe(100);
    const heard = await new Promise<string>((resolve) => shell?.onData(resolve));
    expect(heard).toContain('before the restart');
    expect(client.keeps(shell as PaneShell)).toBe(true);
    shell?.write('ls\r');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spawned[0].written).toEqual(['ls\r']);
    expect(client.survivors('/project')).toEqual([]);
    listener.close();
    expect(lost).toEqual([]);
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
    expect(client.keeps(shell)).toBe(false);
    const code = await new Promise<number>((resolve) => shell.onExit(({ exitCode }) => resolve(exitCode)));
    expect(code).toBe(3);
  }, 10_000);
});
