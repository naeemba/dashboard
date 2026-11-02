import type net from 'node:net';
import { paneScreenCopy, type PaneScreenCopy } from './pane-screen-copy';
import { line, lineReader, type FromHost, type SpawnRequest, type Survivor, type ToHost } from './pane-host-protocol';
import { foregroundName, type PaneShell } from './pane-shell';

// The pane host's half: the shells themselves, kept running whether or not an app is connected. One
// app at a time; pane-host-entry.ts is the socket around it.
type Spawn = (request: SpawnRequest) => PaneShell;

type Entry = { shell: PaneShell; request: SpawnRequest; copy: PaneScreenCopy; foreground: string };

export function paneHostServer(spawn: Spawn, idle: () => void) {
  const entries = new Map<string, Entry>();
  let send: ((message: FromHost) => void) | null = null;

  function start(request: SpawnRequest): void {
    // A spawn for a key that is still running replaces it. The app kills a pane's shell before it
    // starts the next in the same pane, and that kill's exit arrives after this: the check on every
    // event below drops it, so the new shell is not reported dead the moment it starts.
    const old = entries.get(request.key);
    entries.delete(request.key);
    try {
      old?.shell.kill();
    } catch {
      // Already gone.
    }
    let shell: PaneShell;
    try {
      shell = spawn(request);
    } catch {
      // The same exit a shell that could not be found gives, as the app answered it before the host.
      send?.({ type: 'exit', key: request.key, code: 127 });
      return;
    }
    const entry: Entry = { shell, request, copy: paneScreenCopy(() => shell), foreground: '' };
    entries.set(request.key, entry);
    send?.({ type: 'spawned', key: request.key, pid: shell.pid });
    shell.onData((data) => {
      if (entries.get(request.key) !== entry) return;
      entry.copy.push(data);
      send?.({ type: 'data', key: request.key, data });
    });
    shell.onExit(({ exitCode }) => {
      if (entries.get(request.key) !== entry) return;
      entries.delete(request.key);
      send?.({ type: 'exit', key: request.key, code: exitCode });
      if (send === null && entries.size === 0) idle();
    });
  }

  return {
    // An app arriving is told every shell still running, then hears everything after.
    connect(sender: (message: FromHost) => void): void {
      send = sender;
      const panes: Survivor[] = [...entries].map(([key, { shell, request, copy }]) => ({
        key, pid: shell.pid, file: request.file, args: request.args, cwd: request.cwd,
        cols: shell.cols, rows: shell.rows, foreground: foregroundName(shell) ?? '', screen: copy.replay(),
      }));
      sender({ type: 'panes', panes });
    },
    // The app went: quit, a crash, a restart. The shells stay. A host with nothing left to keep has no
    // reason to stay up, and the next app starts its own.
    disconnect(): void {
      send = null;
      // A pause is the app's window asking to draw first (output-pauses.ts). With the app gone nothing
      // will ask to resume, and a paused shell would block on its next write until the next launch.
      for (const { shell } of entries.values()) shell.resume();
      if (entries.size === 0) idle();
    },
    receive(message: ToHost): void {
      if (message.type === 'spawn') return start(message);
      const shell = entries.get(message.key)?.shell;
      if (message.type === 'write') shell?.write(message.data);
      if (message.type === 'resize') shell?.resize(message.cols, message.rows);
      if (message.type === 'kill') shell?.kill();
      if (message.type === 'pause') shell?.pause();
      if (message.type === 'resume') shell?.resume();
    },
    // What is in the foreground of each pane, sent when it changes. The app reads it synchronously
    // (pane-shells.ts's foregroundOf), so it has to be there already when asked.
    // ponytail: polled, so a reading can be one tick stale; push from the data event if a ship ever races it.
    pollForeground(): void {
      if (send === null) return;
      for (const [key, entry] of entries) {
        const name = foregroundName(entry.shell) ?? '';
        if (name === entry.foreground) continue;
        entry.foreground = name;
        send?.({ type: 'foreground', key, name });
      }
    },
  };
}

// What the host's socket does with each app that connects, here rather than in pane-host-entry.ts so
// the test drives the same wiring the host runs.
export function acceptApps(server: ReturnType<typeof paneHostServer>): (socket: net.Socket) => void {
  let current: net.Socket | null = null;
  return (socket) => {
    socket.on('error', () => undefined);
    // One app at a time. An app that went has had its end closed by the kernel, so a second one arriving
    // while one is connected is a second Dashboard on the same user data: it is turned away and runs
    // its shells itself, rather than taking the first one's panes out from under it.
    if (current !== null) {
      socket.end(line({ type: 'busy' }));
      return;
    }
    current = socket;
    socket.setEncoding('utf8');
    socket.on('data', lineReader<ToHost>((message) => server.receive(message)));
    socket.on('close', () => {
      if (current !== socket) return;
      current = null;
      server.disconnect();
    });
    server.connect((message) => socket.write(line(message)));
  };
}
