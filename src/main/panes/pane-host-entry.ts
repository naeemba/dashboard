import { readFileSync } from 'node:fs';
import net from 'node:net';
import { prepareHostSocket } from './pane-host-protocol';
import { acceptApps } from './host-socket';
import { paneHostServer } from './pane-host-server';
import { spawnShell } from './pane-shell';

// The pane host: a node process the app starts detached, so the shells in it outlive the app.
// pane-host-server.ts holds what it does; this is its socket. Run as `node pane-host-entry.js <socket>`,
// and on Windows `<socket> <token file>`: the file, not the token, so the secret is on no command line.
const socketPath = process.argv[2];
const tokenFile = process.argv[3];
const FOREGROUND_POLL_MS = 500;

const server = paneHostServer(spawnShell, () => process.exit(0));

function listen(): void {
  prepareHostSocket(process.platform, socketPath);
  net.createServer(acceptApps(server, tokenFile === undefined ? undefined : readFileSync(tokenFile, 'utf8')))
    // A path too long for a socket (a unix socket's is about a hundred bytes), or a folder it cannot
    // write: the app hears no host, and runs its shells itself.
    .on('error', () => process.exit(1))
    .listen(socketPath);
}

listen();
setInterval(() => server.pollForeground(), FOREGROUND_POLL_MS);
