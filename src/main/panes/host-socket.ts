import net from 'node:net';
import { hostProof, line, lineReader } from './pane-host-protocol';

// The socket code the pane host and the screen host share: an app reaching a host, starting it when
// nothing answers, and a host taking one app at a time. Kept apart from pane-host-server.ts and
// pane-host-client.ts, which load node-pty, so the screen host's bundle does not.

// A first launch starts the host through a login shell, which takes most of a second.
const CONNECT_TRIES = 50;
const CONNECT_PAUSE_MS = 100;

// A host's socket, starting the host when nothing answers on it.
export async function reachHost(socketPath: string, launch: () => void, tries = CONNECT_TRIES): Promise<net.Socket | null> {
  let socket = await attempt(socketPath);
  if (socket !== null) return socket;
  launch();
  for (let tried = 0; socket === null && tried < tries; tried += 1) {
    await new Promise((resolve) => setTimeout(resolve, CONNECT_PAUSE_MS));
    socket = await attempt(socketPath);
  }
  return socket;
}

export function attempt(socketPath: string): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.on('error', () => resolve(null));
  });
}

// What the host's socket does with each app that connects, here rather than in pane-host-entry.ts so
// the test drives the same wiring the host runs. `token` is the pipe's on Windows (paneHostAddress).
// The screen host's socket does the same with its own messages (screen-host-entry.ts).
type AppServer<To> = { receive(message: To): void; connect(answer: (message: { type: string }) => void, proof?: string): void; disconnect(): void };

export function acceptApps<To extends { type: string }>(server: AppServer<To>, token?: string): (socket: net.Socket) => void {
  let current: net.Socket | null = null;
  return (socket) => {
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    socket.on('data', lineReader<To & { nonce?: string }>((message) => {
      if (socket === current) return server.receive(message);
      // Nothing is told before the app says hello: a Windows named pipe lets every user of the machine
      // open it for reading, and one that cannot write must hear no screen nor hold the host from the app.
      // Anything else first is not an app, and is let go rather than held open.
      if (message.type !== 'hello') return void socket.destroy();
      // One app at a time. An app that went has had its end closed by the kernel, so a second one
      // arriving while one is connected is a second Dashboard on the same user data: it is turned away
      // and runs its own, rather than taking what the host keeps for the first one out from under it.
      // The proof goes with a busy too: on Windows an unproven busy is an impostor's.
      const proof = token !== undefined && message.nonce !== undefined ? hostProof(token, message.nonce) : undefined;
      if (current !== null) {
        socket.end(line({ type: 'busy', proof }));
        return;
      }
      current = socket;
      server.connect((answer) => socket.write(line(answer)), proof);
    }));
    socket.on('close', () => {
      if (current !== socket) return;
      current = null;
      server.disconnect();
    });
  };
}
