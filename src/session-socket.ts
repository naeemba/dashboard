import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { failureText } from './failure';
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

// One JSON request per connection, read to its end, then one JSON answer. A request that is not JSON is
// answered as a refusal rather than dropped, so the command says what went wrong, and so is one of the
// wrong shape or an answer that throws: either would otherwise leave the command waiting for good.
export function listenForSessions(
  socketPath: string,
  answer: (request: SessionRequest) => Promise<SessionReply>,
  failed: (error: Error) => void,
): net.Server {
  // Half open, because the command ends its side to say the request is whole, and the answer goes back
  // after that over the half still open.
  const server = net.createServer({ allowHalfOpen: true }, (connection) => {
    let text = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => { text += chunk; });
    connection.on('end', () => {
      let request: SessionRequest | undefined;
      try {
        request = JSON.parse(text) as SessionRequest;
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
    });
    // A command killed mid-answer is nobody's to tell.
    connection.on('error', () => undefined);
  });
  server.on('error', failed);
  server.listen(socketPath);
  return server;
}

// The command's half: the request out, the answer back. A socket nobody is listening on is the app
// that opened this pane having quit, which is worth saying in those words.
export function askApp(socketPath: string, request: SessionRequest): Promise<SessionReply> {
  return new Promise((resolve) => {
    let text = '';
    const connection = net.connect(socketPath, () => connection.end(JSON.stringify(request)));
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
