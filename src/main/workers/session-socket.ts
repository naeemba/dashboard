import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { failureText } from '../../shared/errors/failure';
import { conflictedLine, conflictedWords, landedLine, landedWords, outsidePaneRefusal, retriesInOlderWords, type SessionCommand, type SessionReply, type SessionRequest } from './session-cli';
import { canConnect } from '../app/can-connect';
import { appUserDataFolder, clearSocketPointer, readSocketPointer } from '../command/app-address';
import { mayStartApp, reachApp } from '../command/reach-app';
import { appStarter } from '../command/start-app';
import { ACCEPTANCE_TIMEOUT, ACCEPTED, awaitAcceptance, unacceptedLine, versionRefusal } from './app-handshake';

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

// The socket gone at quit: no longer listened on, the pointer a terminal outside the panes reads
// cleared (app-address.ts), and its own folder removed.
export function closeSessionSocket(server: net.Server, platform: string, userData: string, socketPath: string): void {
  server.close();
  clearSocketPointer(userData, socketPath);
  const folder = sessionSocketFolder(platform, socketPath);
  if (folder !== null) rmSync(folder, { recursive: true, force: true });
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
// otherwise leave the command waiting for good. A command of another build than appVersion is refused
// too, and one the app will answer hears ACCEPTED first: app-handshake.ts says why.
export function listenForSessions(
  socketPath: string,
  appVersion: string,
  answer: (request: SessionRequest) => Promise<SessionReply>,
  failed: (error: Error) => void,
  listening: () => void = () => undefined,
): net.Server {
  // Half open only for the refusal below: a command that closed its side before the newline would
  // otherwise have the socket's own write shut before the refusal is written. A whole request needs
  // none of it — the answer goes back over a connection both sides still hold open.
  const server = net.createServer({ allowHalfOpen: true }, (connection) => {
    let text = '';
    // One request per connection: anything after its newline, or a close after it, is not another.
    let read = false;
    const refuse = (output: string) => connection.end(JSON.stringify({ ok: false, output }));
    function handle(line: string): void {
      if (read) return;
      read = true;
      let request: SessionRequest | undefined;
      try {
        request = JSON.parse(line) as SessionRequest;
      } catch {
        request = undefined;
      }
      if (!Array.isArray(request?.args) || typeof request.directory !== 'string') {
        refuse('the request was not one the app could read');
        return;
      }
      const refusal = versionRefusal(appVersion, request.version, request.args);
      if (refusal !== undefined) {
        refuse(refusal);
        return;
      }
      connection.write(ACCEPTED);
      void answer(request)
        .catch((error: unknown): SessionReply => ({ ok: false, output: failureText(error) }))
        .then((reply) => connection.end(JSON.stringify(reply)));
    }
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => {
      if (read) return;
      text += chunk;
      const end = text.indexOf(REQUEST_END);
      if (end !== -1) handle(text.slice(0, end));
    });
    // Closed before the newline: a request cut off on its way, or one from a command before #196, which
    // ended its request by closing its side. The first does not parse and is refused as unreadable; the
    // second does, and is refused as another build.
    connection.on('end', () => handle(text));
    // A command killed mid-answer is nobody's to tell.
    connection.on('error', () => undefined);
  });
  server.on('error', failed);
  // 0600 on top of the 0700 folder: the folder is what keeps others out, and the socket's own mode,
  // which the umask decides, should not be the one thing left saying otherwise. listening is when a
  // command outside a pane may be told where it is (app-address.ts).
  server.listen(socketPath, () => {
    if (process.platform !== 'win32') chmodSync(socketPath, 0o600);
    listening();
  });
  return server;
}

// A command's whole conversation with the app, whichever noun it was: the words out, the answer
// printed, the exit code back. `older` is the same request in an older app's words, sent instead when
// the app refuses this one's words: a notify whose hook grew words an app from before them does not
// take (workers-decision-4).
export async function askRunningApp(commandArguments: readonly string[], older: readonly string[] = commandArguments): Promise<number> {
  const reply = await runningAppReply(commandArguments, process.cwd(), older, mayStartApp(commandArguments));
  if (reply.output !== '') (reply.ok ? process.stdout : process.stderr).write(`${reply.output}\n`);
  return reply.ok ? 0 : 1;
}

// The app's answer to the words, asked from `directory`. Which app, and starting it when none answers
// and `mayStart` allows, is reach-app.ts's; not reaching one is a refusal saying so.
async function runningAppReply(commandArguments: readonly string[], directory: string, older: readonly string[], mayStart: boolean): Promise<SessionReply> {
  const userData = appUserDataFolder();
  const reached = await reachApp({
    paneSocket: process.env.DASHBOARD_SOCKET,
    pointed: () => readSocketPointer(userData),
    connects: canConnect,
    start: appStarter(process.env),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: Date.now,
  }, mayStart);
  if (!reached.ok) return { ok: false, output: reached.message };
  const ask = (args: readonly string[]) => askApp(reached.socket, { directory, args, version: __BUILD_VERSION__ });
  const reply = await ask(commandArguments);
  return retriesInOlderWords(reply, commandArguments, older) ? ask(older) : reply;
}

// What `pr land` and a board move print of `pane landed` (workers-decision-1): the app's lines, or why
// no worker was released. Never starting the app, which their own work did not need, and nothing at
// all outside a pane (outsidePaneRefusal).
export async function askLanded(by: 'branch' | 'card', name: string, directory: string): Promise<string> {
  const reply = await askFromLand({ kind: 'landed', by, name, from: null }, landedWords(by, name, process.env.DASHBOARD_PANE), directory);
  return reply === null ? '' : landedLine(reply);
}

// What `pr land` asks of `pane conflicted` once a pull request conflicts: the app's line when an agent
// on the branch was sent /pr-conflicts; '' when no agent is on it or outside a pane; why not when the
// app refused or could not be reached, so that reads apart from an empty branch.
export async function askConflicted(branch: string, pullRequest: string, directory: string): Promise<{ handed: boolean; line: string }> {
  const reply = await askFromLand({ kind: 'conflicted', branch, pullRequest, from: null }, conflictedWords(branch, pullRequest, process.env.DASHBOARD_PANE), directory);
  if (reply === null) return { handed: false, line: '' };
  return conflictedLine(reply);
}

// The app asked on behalf of a command whose own work is done without it: null outside a pane, a
// failure as a refusal, never the app started.
async function askFromLand(command: SessionCommand, words: string[], directory: string): Promise<SessionReply | null> {
  if (process.env.DASHBOARD_SOCKET === undefined && outsidePaneRefusal(command) !== null) return null;
  return runningAppReply(words, directory, words, false)
    .catch((error: unknown): SessionReply => ({ ok: false, output: failureText(error) }));
}

// The command's half: the request out as one line, with the connection left open for the answer, and
// the answer read until the app closes it. reachApp has already found the socket listening, so an
// error here is the app going away mid-request. An app that has not taken the request in
// acceptanceTimeout is one that never will.
export function askApp(socketPath: string, request: SessionRequest, acceptanceTimeout = ACCEPTANCE_TIMEOUT): Promise<SessionReply> {
  return new Promise((resolve) => {
    let text = '';
    const connection = net.connect(socketPath, () => connection.write(JSON.stringify(request) + REQUEST_END));
    awaitAcceptance(connection, acceptanceTimeout, () => resolve({ ok: false, output: unacceptedLine(acceptanceTimeout) }));
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
      resolve({ ok: false, output: `the running Dashboard stopped answering: ${failureText(error)}` });
    });
  });
}
