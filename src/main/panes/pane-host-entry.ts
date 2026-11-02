import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { line, lineReader, type ToHost } from './pane-host-protocol';
import { paneHostServer } from './pane-host-server';
import { spawnShell } from './pane-shell';

// The pane host: a node process the app starts detached, so the shells in it outlive the app.
// pane-host-server.ts holds what it does; this is its socket. Run as `node pane-host-entry.js <socket>`.
const socketPath = process.argv[2];
const FOREGROUND_POLL_MS = 500;

const server = paneHostServer(spawnShell, () => process.exit(0));
let current: net.Socket | null = null;

// The app starts a host only when nothing answered on the socket, so a file already there is one a
// host that died left behind.
function listen(): void {
  const folder = path.dirname(socketPath);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  rmSync(socketPath, { force: true });
  net.createServer((socket) => {
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
  })
    // A path too long for a socket (a unix socket's is about a hundred bytes), or a folder it cannot
    // write: the app hears no host, and runs its shells itself.
    .on('error', () => process.exit(1))
    .listen(socketPath);
}

listen();
setInterval(() => server.pollForeground(), FOREGROUND_POLL_MS);
