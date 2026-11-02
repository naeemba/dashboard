import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { failureText } from '../../shared/errors/failure';
import type { SessionReply, SessionRequest } from './session-cli';

// The `session` command's way into the running app. A pane's command is a separate node process and
// the panes and their ptys are main's, so it has to ask: one request in, one answer out, over a socket
// only this user can reach. The board command needs none of this — its file is the whole of its state.

// In a folder of its own that only this user can enter, made fresh each launch: anyone who can reach
// the socket can start Claude in your panes, and the temporary folder is shared with every user on
// Linux. Fresh also means a second Dashboard — a development build beside the installed one — never
// takes over the other's, and every pane's environment names the one that opened it. Windows has no
// socket files; a named pipe, named after the process, is the same thing there.
export function sessionSocketPath(platform: string, temporary: string, pid: number): string {
  if (platform === 'win32') return `\\\\.\\pipe\\dashboard-session-${pid}`;
  return path.join(mkdtempSync(path.join(temporary, 'dashboard-')), 'session.sock');
}

// The folder sessionSocketPath made for the socket, which quitting removes, or null when it made none.
// Decided here beside it, so a socket put anywhere else never turns the quit into a recursive remove
// of a folder this file did not make.
export function sessionSocketFolder(platform: string, socketPath: string): string | null {
  return platform === 'win32' ? null : path.dirname(socketPath);
}

// What ends a request: one line. JSON.stringify writes a newline inside a string as `\n`, so the first
// real one is the end of the request. Not the command closing its side, which is what said it before:
// a Windows named pipe does not stay half open, so closing one side closed both, and the answer was
// written into a pipe nobody was reading — every `pane` command came back with an empty reply.
const REQUEST_END = '\n';

// One JSON request per connection, read to its first newline, then one JSON answer, after which the app
// closes the connection and that is the command's sign the answer is whole. A request that is not JSON
// is answered as a refusal rather than dropped, so the command says what went wrong, and so is one of
// the wrong shape, one cut off before its newline, or an answer that throws: any of them would
// otherwise leave the command waiting for good.
export function listenForSessions(
  socketPath: string,
  answer: (request: SessionRequest) => Promise<SessionReply>,
  failed: (error: Error) => void,
): net.Server {
  // Half open only for the refusal below: a command that closed its side before the newline would
  // otherwise have the socket's own write shut before the refusal is written. A whole request needs
  // none of it — the answer goes back over a connection both sides still hold open.
  const server = net.createServer({ allowHalfOpen: true }, (connection) => {
    let text = '';
    // One request per connection: anything after its newline, or a close after it, is not another.
    let read = false;
    function handle(line: string | undefined): void {
      if (read) return;
      read = true;
      let request: SessionRequest | undefined;
      try {
        request = line === undefined ? undefined : JSON.parse(line) as SessionRequest;
      } catch {
        request = undefined;
      }
      if (!Array.isArray(request?.args) || typeof request.directory !== 'string') {
        connection.end(JSON.stringify({ ok: false, output: 'the request was not one the app could read' }));
        return;
      }
      void answer(request)
        .catch((error: unknown): SessionReply => ({ ok: false, output: failureText(error) }))
        .then((reply) => connection.end(JSON.stringify(reply)));
    }
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => {
      text += chunk;
      const end = text.indexOf(REQUEST_END);
      if (end !== -1) handle(text.slice(0, end));
    });
    // Closed before the newline: a request that never finished arriving.
    connection.on('end', () => handle(undefined));
    // A command killed mid-answer is nobody's to tell.
    connection.on('error', () => undefined);
  });
  server.on('error', failed);
  server.listen(socketPath);
  return server;
}

// A command's whole conversation with the app that opened its pane, whichever noun it was: the words
// out, the answer printed, the exit code back. Run outside such a pane, it says so instead.
export async function askAppFromPane(commandArguments: readonly string[]): Promise<number> {
  const socket = process.env.DASHBOARD_SOCKET;
  if (!socket) {
    process.stderr.write('DASHBOARD_SOCKET is not set — run this from a pane the Dashboard app opened\n');
    return 1;
  }
  const reply = await askApp(socket, { directory: process.cwd(), args: commandArguments });
  if (reply.output !== '') (reply.ok ? process.stdout : process.stderr).write(`${reply.output}\n`);
  return reply.ok ? 0 : 1;
}

// The command's half: the request out as one line, with the connection left open for the answer, and
// the answer read until the app closes it. A socket nobody is listening on is the app that opened this
// pane having quit, which is worth saying in those words.
export function askApp(socketPath: string, request: SessionRequest): Promise<SessionReply> {
  return new Promise((resolve) => {
    let text = '';
    const connection = net.connect(socketPath, () => connection.write(JSON.stringify(request) + REQUEST_END));
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => { text += chunk; });
    connection.on('end', () => {
      try {
        resolve(JSON.parse(text) as SessionReply);
      } catch {
        resolve({ ok: false, output: 'the app answered with something that was not a reply' });
      }
    });
    connection.on('error', (error) => {
      resolve({ ok: false, output: `the Dashboard that opened this pane is not answering: ${failureText(error)}` });
    });
  });
}
