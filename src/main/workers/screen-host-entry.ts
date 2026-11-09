import net from 'node:net';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { prepareHostSocket } from '../panes/pane-host-protocol';
import { acceptApps } from '../panes/host-socket';
import { scopedQuery } from '../chat/claude-process';
import { screenHostServer } from './screen-host-server';
import type { ToScreenHost } from './screen-host-protocol';

// The screen host: a node process the app starts detached, so a worker screen's Claude outlives the
// app (workers-decision-6). screen-host-server.ts holds what it does; this is its socket. Run as
// `node screen-host-entry.mjs <socket>`. It goes once no app is connected and no session runs.
const socketPath = process.argv[2];

const server = screenHostServer(scopedQuery(query), () => process.exit(0));

prepareHostSocket(process.platform, socketPath);
net.createServer(acceptApps<ToScreenHost>(server))
  // A path too long for a socket, or a folder it cannot write: the app hears no host, and runs its
  // worker screens itself.
  .on('error', () => process.exit(1))
  .listen(socketPath);
