import { createHash, createHmac, randomBytes } from 'node:crypto';
import { chmodSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ScopedCommand } from '../processes/scope';

// What the app and the pane host say to each other: one JSON message per line over a unix socket,
// or a named pipe on Windows.
// panes-decision-1 says why the shells live in a process of their own.

// In the socket's name, so an app built against another shape of these messages never talks to a host
// that would misread them. It starts a host of its own instead, and the old host's shells run on
// unseen until they exit. Bump it with any change to the types below that an older host would misread.
// A message type it has never heard of it drops (pane-host-server.ts's receive), so adding one, as
// pause, resume and hello were, keeps the running host and its shells: an older host just never pauses.
// The bump is weighed against an older app too: one meeting a newer host that waits on a message it
// never sends (hello) hangs at start until it is quit. That costs only a downgrade; a bump costs every
// update the panes it was running.
const PROTOCOL_VERSION = 1;

// In a folder of its own, made private before the socket is: anyone who can reach the socket can type
// into every shell. The user-data folder, not the temporary one, so a second Dashboard started with its
// own --user-data-dir has a host of its own. One on the same user data (a development build beside the
// installed app) reaches the same socket, and the host turns it away with `busy` while the first is
// connected. Windows has no socket files: a named pipe stands in, as it does for sessionSocketPath.
// There the app is the one connecting, and any user of the machine can create a pipe of a name not
// taken and answer as the host, hearing every keystroke. Any user can also list the pipes, so the name
// is no secret: it is a hash of a token kept in the user data (pipeToken), which no other user can read,
// and the host proves it holds that token (hostProof) before the app sends it anything but hello.
// `token`, and the file the host reads it from, are set only on Windows. Null when the token could
// not be read or made: no host this run.
export type PaneHostAddress = { socket: string; token?: string; tokenFile?: string };

export function paneHostAddress(platform: string, userData: string): PaneHostAddress | null {
  if (platform !== 'win32') return { socket: path.join(userData, 'pane-host', `panes-${PROTOCOL_VERSION}.sock`) };
  try {
    const token = pipeToken(userData);
    return { socket: pipeName(token), token, tokenFile: pipeTokenFile(userData) };
  } catch {
    return null;
  }
}

export function pipeName(token: string): string {
  return `\\\\.\\pipe\\dashboard-panes-${PROTOCOL_VERSION}-${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

// What the host answers a hello's nonce with, which only a holder of the token can work out.
export function hostProof(token: string, nonce: string): string {
  return createHmac('sha256', token).update(nonce).digest('hex');
}

const PIPE_TOKEN = /^[0-9a-f]{32}$/;

export function pipeTokenFile(userData: string): string {
  return path.join(userData, 'pane-host', 'pipe-token');
}

// The token, made on the first launch and kept: a new one names a new pipe, and a host running on the
// old name would be left running unseen while the app launched a second. So it is written only when
// there is no file, or the file holds no token (no host can be on a name it never gave). A read that
// fails any other way (a scan holding the file) is thrown, not taken for a missing file. The file is
// never seen half written (writeToken), so two launches making it at once agree: the second finds the
// first's whole file and keeps it.
function pipeToken(userData: string): string {
  const file = pipeTokenFile(userData);
  try {
    const kept = readFileSync(file, 'utf8');
    return PIPE_TOKEN.test(kept) ? kept : writeToken(file, 'replace');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    return writeToken(file, 'create');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const raced = readFileSync(file, 'utf8');
    if (!PIPE_TOKEN.test(raced)) throw new Error('The pipe token file holds no token', { cause: error });
    return raced;
  }
}

// After something at the pipe's name failed the proof: the next launch uses a name it never saw.
export function renewPipeToken(userData: string): void {
  writeToken(pipeTokenFile(userData), 'replace');
}

// Written whole to a file of its own and then put in place in one step, so a reader finds either no
// token file or a whole one. `create` links it in, which fails with EEXIST if another launch got there
// first; `replace` renames it over the old one.
function writeToken(file: string, how: 'create' | 'replace'): string {
  const token = randomBytes(16).toString('hex');
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const written = `${file}.${randomBytes(8).toString('hex')}`;
  writeFileSync(written, token, { mode: 0o600, flag: 'wx' });
  try {
    if (how === 'create') linkSync(written, file);
    else renameSync(written, file);
  } finally {
    rmSync(written, { force: true });
  }
  return token;
}

// What the host does before it listens: the socket's folder made private, and a file a host that
// died left behind removed (the app starts a host only when nothing answered). A named pipe has no
// folder and leaves no file.
export function prepareHostSocket(platform: string, socketPath: string): void {
  if (platform === 'win32') return;
  const folder = path.dirname(socketPath);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  rmSync(socketPath, { force: true });
}

// What a pane is called on both sides of the socket. The project and the pane's number, not the
// terminal id: the id carries the slot, and a project can come back on a different page after a restart.
export function paneKey(projectPath: string, index: number): string {
  return JSON.stringify([projectPath, index]);
}

export function paneOfKey(key: string): { projectPath: string; index: number } {
  const [projectPath, index] = JSON.parse(key) as [string, number];
  return { projectPath, index };
}

// `file` and `args` are the pane's own command, which is what a survivor reports back. `scope` is that
// command as started inside the pane's systemd scope (processes/scope.ts), when it has one: what the
// pty actually runs. An older host ignores it and runs the command unscoped.
export type SpawnRequest = {
  key: string;
  file: string;
  args: string[];
  scope?: ScopedCommand;
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

export type ToHost =
  // The app's first line, before which the host says nothing (pane-host-server.ts's acceptApps). An
  // older host drops it and answers anyway; an older app says none and waits on a newer host for good.
  // `nonce` only on Windows, for the host's proof (paneHostAddress).
  | { type: 'hello'; nonce?: string }
  | ({ type: 'spawn' } & SpawnRequest)
  | { type: 'write'; key: string; data: string }
  | { type: 'resize'; key: string; cols: number; rows: number }
  | { type: 'kill'; key: string }
  | { type: 'pause'; key: string }
  | { type: 'resume'; key: string };

// A shell the host is running, as it is told to an app arriving. `screen` is the pane's screen as
// pane-screen-copy.ts replays it, so the pane draws as it was rather than blank.
export type Survivor = {
  key: string;
  pid: number;
  file: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  foreground: string;
  screen: string;
  // The systemd scope it runs in, when it was started in one.
  unit?: string;
};

export type FromHost =
  // `proof` answers the hello's nonce, when there was one.
  | { type: 'panes'; panes: Survivor[]; proof?: string }
  // Another app is connected; this one runs its shells itself. `proof` as for panes.
  | { type: 'busy'; proof?: string }
  | { type: 'spawned'; key: string; pid: number }
  | { type: 'data'; key: string; data: string }
  | { type: 'exit'; key: string; code: number }
  | { type: 'foreground'; key: string; name: string };

// Cuts a stream into its lines and hands each one on parsed. A chunk ends wherever the socket put it,
// often in the middle of a message, so the unfinished end is kept for the next chunk.
// Only the new chunk is searched: the host's first answer is one line holding every kept pane's
// screen, megabytes long, and rescanning what is already held on every chunk would be quadratic in it.
export function lineReader<T>(message: (value: T) => void): (chunk: string) => void {
  let unfinished: string[] = [];
  return (chunk) => {
    let start = 0;
    for (let end = chunk.indexOf('\n'); end !== -1; end = chunk.indexOf('\n', start)) {
      const line = unfinished.join('') + chunk.slice(start, end);
      unfinished = [];
      start = end + 1;
      if (line === '') continue;
      // A line that is not JSON is skipped: thrown out of a socket's data handler it would end the host,
      // and every shell of every project with it.
      let parsed: T;
      try {
        parsed = JSON.parse(line) as T;
      } catch {
        continue;
      }
      message(parsed);
    }
    if (start < chunk.length) unfinished.push(chunk.slice(start));
  };
}

// Also the screen host's (screen-host-protocol.ts), so both hosts frame their lines the same way.
export function line<Message extends { type: string }>(message: Message): string {
  return `${JSON.stringify(message)}\n`;
}
