import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hostCommand, hostLaunch, launchPaneHost, paneHost } from './pane-host-client';
import { hostProof, line, lineReader, paneHostAddress, paneKey, pipeName, pipeTokenFile, prepareHostSocket, renewPipeToken, type FromHost, type SpawnRequest, type ToHost } from './pane-host-protocol';
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
    pause: () => { written.push('<pause>'); },
    resume: () => { written.push('<resume>'); },
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

  it('pauses and resumes reading a shell when the app asks', () => {
    const { host, spawned } = server();
    host.connect(() => undefined);
    host.receive({ type: 'spawn', ...request('k') });
    host.receive({ type: 'pause', key: 'k' });
    host.receive({ type: 'resume', key: 'k' });
    expect(spawned[0].written).toEqual(['<pause>', '<resume>']);
  });

  it('resumes every shell when the app goes, since nothing is left to ask', () => {
    const { host, spawned } = server();
    host.connect(() => undefined);
    host.receive({ type: 'spawn', ...request('k') });
    host.receive({ type: 'pause', key: 'k' });
    host.disconnect();
    expect(spawned[0].written).toEqual(['<pause>', '<resume>']);
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

describe('hostLaunch', () => {
  it('starts node straight on Windows, whatever SHELL says, since no POSIX shell is there to read it', () => {
    expect(hostLaunch('win32', undefined, 'C:\\app\\host.js', '\\\\.\\pipe\\p')).toEqual({ file: 'node', args: ['C:\\app\\host.js', '\\\\.\\pipe\\p'] });
    expect(hostLaunch('win32', '/usr/bin/bash', 'host.js', 'p')).toEqual({ file: 'node', args: ['host.js', 'p'] });
    expect(hostLaunch('win32', undefined, 'host.js', 'p', 'C:\\data\\pipe-token')).toEqual({ file: 'node', args: ['host.js', 'p', 'C:\\data\\pipe-token'] });
  });

  it('goes through the login shell elsewhere, and launches nothing without one', () => {
    expect(hostLaunch('linux', '/bin/zsh', '/host.js', '/s.sock')).toEqual({ file: '/bin/zsh', args: ['-lic', "exec node '/host.js' '/s.sock'"] });
    expect(hostLaunch('darwin', undefined, '/host.js', '/s.sock')).toBeNull();
  });
});

describe('paneHostAddress', () => {
  it('names the pipe after a hash of the token, so a listing of the pipes does not give the token away', () => {
    const token = 'ab'.repeat(16);
    expect(pipeName(token)).toMatch(/^\\\\\.\\pipe\\dashboard-panes-1-[0-9a-f]{32}$/);
    expect(pipeName(token)).not.toContain(token);
    expect(pipeName(token)).not.toBe(pipeName('cd'.repeat(16)));
  });

  it('keeps one secret token per user-data folder, and remakes only a file that holds no token', () => {
    const first = mkdtempSync(path.join(os.tmpdir(), 'pane-token-'));
    const second = mkdtempSync(path.join(os.tmpdir(), 'pane-token-'));
    try {
      const address = paneHostAddress('win32', first);
      expect(address?.token).toMatch(/^[0-9a-f]{32}$/);
      expect(address?.socket).toBe(pipeName(address?.token ?? ''));
      expect(paneHostAddress('win32', first)).toEqual(address);
      expect(paneHostAddress('win32', second)?.token).not.toBe(address?.token);
      writeFileSync(pipeTokenFile(first), '');
      expect(paneHostAddress('win32', first)?.token).toMatch(/^[0-9a-f]{32}$/);
      const remade = paneHostAddress('win32', first)?.token;
      renewPipeToken(first);
      expect(paneHostAddress('win32', first)?.token).not.toBe(remade);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it('gives no address, and writes no token, when the token file cannot be read for a reason other than missing', () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'pane-token-'));
    try {
      mkdirSync(pipeTokenFile(folder), { recursive: true });
      expect(paneHostAddress('win32', folder)).toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is a socket file in a pane-host folder of the user data elsewhere, with no token', () => {
    expect(paneHostAddress('linux', '/data')).toEqual({ socket: path.join('/data', 'pane-host', 'panes-1.sock') });
  });
});

// A shell that exits with this code, on whichever platform the test runs.
function exitingShell(code: number): Pick<SpawnRequest, 'file' | 'args' | 'env'> {
  const env = { ...process.env } as Record<string, string>;
  return process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/c', `exit ${code}`], env }
    : { file: '/bin/sh', args: ['-c', `exit ${code}`], env };
}

// On Windows these run over a real named pipe, the way the app does there.
describe('paneHost over a socket', () => {
  let folder = '';
  // Every connection the test host took, ended before its folder goes.
  const accepted: net.Socket[] = [];
  afterEach(() => {
    for (const socket of accepted.splice(0)) socket.destroy();
    rmSync(folder, { recursive: true, force: true });
  });

  // The socket the app would use with this folder as its user data, made ready as the host makes it.
  function hostSocket(): string {
    folder = mkdtempSync(path.join(os.tmpdir(), 'pane-host-'));
    const socketPath = paneHostAddress(process.platform, folder)?.socket ?? '';
    prepareHostSocket(process.platform, socketPath);
    return socketPath;
  }

  // The host's socket, with the server above behind it, wired the way pane-host-entry.ts wires it.
  function listen(host: ReturnType<typeof paneHostServer>, socketPath: string, token?: string): Promise<net.Server> {
    const accept = acceptApps(host, token);
    const listener = net.createServer((socket) => {
      accepted.push(socket);
      accept(socket);
    });
    return new Promise((resolve) => listener.listen(socketPath, () => resolve(listener)));
  }

  it('seeds a new host shell\'s foreground with the shell itself, not an empty name', async () => {
    const socketPath = hostSocket();
    const { host } = server();
    const listener = await listen(host, socketPath);
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: () => undefined });
    await client.ready;
    expect(client.spawn(request(paneKey('/project', 1))).process).toBe('/bin/zsh');
    listener.close();
  });

  it('takes back a shell the host kept, with its screen first and its typing reaching it', async () => {
    const socketPath = hostSocket();
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
    const socketPath = hostSocket();
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
    const next = client.spawn({ ...request(paneKey('/project', 1)), ...exitingShell(0), cwd: folder });
    expect(next.kept).toBeUndefined();
    await new Promise((resolve) => next.onExit(resolve));
    listener.close();
  });

  it('turns a second app away while one is connected, and the first keeps hearing its shells', async () => {
    const socketPath = hostSocket();
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

  it('tells a connection nothing until it says hello, and it does not hold the host from the app', async () => {
    const socketPath = hostSocket();
    const { host } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    const listener = await listen(host, socketPath);
    const silent = net.connect(socketPath);
    let overheard = '';
    silent.on('data', (data) => { overheard += String(data); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: (message) => lost.push(message) });
    await client.ready;
    expect(client.adopt('/project')).toHaveLength(1);
    expect(lost).toEqual([]);
    expect(overheard).toBe('');
    silent.destroy();
    listener.close();
  });

  it('lets go of a connection whose first line is not hello, and passes nothing it said on', async () => {
    const socketPath = hostSocket();
    const { host, spawned } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    const listener = await listen(host, socketPath);
    const stranger = net.connect(socketPath);
    const closed = new Promise((resolve) => stranger.on('close', resolve));
    stranger.on('error', () => undefined);
    stranger.write(line({ type: 'write', key: paneKey('/project', 2), data: 'x' }));
    await closed;
    expect(spawned[0].written).toEqual([]);
    const client = paneHost({ socket: socketPath, launch: () => undefined, lost: () => undefined });
    await client.ready;
    expect(client.adopt('/project')).toHaveLength(1);
    listener.close();
  });

  it('adopts from a host that proves it holds the token', async () => {
    const socketPath = hostSocket();
    const { host } = server();
    host.receive({ type: 'spawn', ...request(paneKey('/project', 2)) });
    const token = 'ab'.repeat(16);
    const listener = await listen(host, socketPath, token);
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, token, launch: () => undefined, lost: (message) => lost.push(message) });
    await client.ready;
    expect(client.adopt('/project')).toHaveLength(1);
    expect(lost).toEqual([]);
    listener.close();
  });

  it('sends nothing past hello to whatever answers without the proof, and runs its shells itself', async () => {
    const socketPath = hostSocket();
    const heard: ToHost[] = [];
    const listener = net.createServer((socket) => {
      accepted.push(socket);
      socket.setEncoding('utf8');
      socket.on('data', lineReader<ToHost>((message) => {
        heard.push(message);
        // A guess at the proof, keyed by something other than the token.
        if (message.type === 'hello') socket.write(line({ type: 'panes', panes: [], proof: hostProof('guess', message.nonce ?? '') }));
      }));
    });
    await new Promise<void>((resolve) => listener.listen(socketPath, resolve));
    const lost: string[] = [];
    let impostors = 0;
    const client = paneHost({
      socket: socketPath, token: 'ab'.repeat(16), launch: () => undefined,
      impostor: () => { impostors += 1; }, lost: (message) => lost.push(message),
    });
    await client.ready;
    expect(impostors).toBe(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toContain('Something other than the pane host');
    const shell = client.spawn({ ...request(paneKey('/project', 1)), ...exitingShell(0), cwd: folder });
    expect(shell.kept).toBeUndefined();
    await new Promise((resolve) => shell.onExit(resolve));
    expect(heard.map((message) => message.type)).toEqual(['hello']);
    listener.close();
  });

  it('runs its shells itself when there is no address this run', async () => {
    const lost: string[] = [];
    let launched = 0;
    const client = paneHost({ socket: null, launch: () => { launched += 1; }, lost: (message) => lost.push(message) });
    await client.ready;
    expect(launched).toBe(0);
    expect(lost[0]).toContain('pipe token');
  });

  it('runs its shells itself when the host is busy with another app', async () => {
    const socketPath = hostSocket();
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
    expect(client.spawn({ ...request(paneKey('/project', 1)), ...exitingShell(0), cwd: folder }).kept).toBeUndefined();
    listener.close();
  });

  it('runs shells in this process when no host answers', async () => {
    const socketPath = hostSocket();
    let launched = 0;
    const lost: string[] = [];
    const client = paneHost({ socket: socketPath, launch: () => { launched += 1; }, lost: (message) => lost.push(message) });
    await client.ready;
    expect(launched).toBe(1);
    expect(lost).toHaveLength(1);
    const shell = client.spawn({ ...request(paneKey('/project', 1)), ...exitingShell(3), cwd: folder });
    expect(shell.kept).toBeUndefined();
    const code = await new Promise<number>((resolve) => shell.onExit(({ exitCode }) => resolve(exitCode)));
    expect(code).toBe(3);
  }, 10_000);

  // The launch itself: node started detached, the way launchPaneHost does on this platform, binding the
  // socket the app names. A stand-in entry, since the real one is built by vite: it answers the app
  // with no kept shells once it says hello, and stops when told to kill one.
  it('launches a host that binds its socket and answers the app', async () => {
    const socketPath = hostSocket();
    const entry = path.join(folder, 'host.js');
    writeFileSync(entry, `
      const net = require('node:net');
      net.createServer((socket) => {
        socket.on('data', (data) => {
          if (String(data).includes('hello')) socket.write(${JSON.stringify(line({ type: 'panes', panes: [] }))});
          if (String(data).includes('kill')) process.exit(0);
        });
      }).listen(process.argv[2]);
      setTimeout(() => process.exit(1), 20000);
    `);
    const lost: string[] = [];
    const stopped = new Promise<void>((resolve) => {
      const client = paneHost({
        socket: socketPath,
        launch: () => launchPaneHost('/bin/sh', entry, socketPath, folder),
        lost: (message) => { lost.push(message); resolve(); },
      });
      void client.ready.then(() => {
        expect(lost).toEqual([]);
        client.spawn(request(paneKey('/project', 1))).kill();
      });
    });
    await stopped;
    expect(lost).toEqual(['The pane host stopped; every pane it ran has ended']);
  }, 15_000);
});
