import net from 'node:net';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { acceptApps } from '../panes/host-socket';
import { scopedQuery } from '../chat/claude-process';
import { screenHostServer } from './screen-host-server';
import { claimHostSocket, forgetHost, recordHost } from './dead-host';
import type { ToScreenHost } from './screen-host-protocol';

// The screen host: a node process the app starts detached, so a worker screen's Claude outlives the
// app (workers-decision-6). screen-host-server.ts holds what it does; this is its socket. Run as
// `node screen-host-entry.mjs <socket>`. It goes once no app is connected and no session runs.
const socketPath = process.argv[2];

const server = screenHostServer(scopedQuery(query), () => {
  forgetHost(socketPath);
  process.exit(0);
});

// A host already answering keeps the socket, and the app that launched this one reaches it instead.
// Otherwise the sessions a host killed before it left running are ended first (dead-host.ts).
if (!(await claimHostSocket(process.platform, socketPath))) process.exit(0);
net.createServer(acceptApps<ToScreenHost>(server))
  // A path too long for a socket, or a folder it cannot write: the app hears no host, and runs its
  // worker screens itself.
  .on('error', () => process.exit(1))
  .listen(socketPath, () => recordHost(socketPath));
