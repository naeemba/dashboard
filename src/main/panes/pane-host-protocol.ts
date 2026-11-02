import path from 'node:path';

// What the app and the pane host say to each other: one JSON message per line over a unix socket.
// panes-decision-1 says why the shells live in a process of their own.

// In the socket's name, so an app built against another shape of these messages never talks to a host
// that would misread them. It starts a host of its own instead, and the old host's shells run on
// unseen until they exit. Bump it with any change to the types below.
const PROTOCOL_VERSION = 1;

// In a folder of its own, made private before the socket is: anyone who can reach the socket can type
// into every shell. The user-data folder, not the temporary one, so a second Dashboard started with its
// own --user-data-dir has a host of its own. One on the same user data (a development build beside the
// installed app) reaches the same socket, and the host turns it away with `busy` while the first is
// connected.
export function paneHostSocket(userData: string): string {
  return path.join(userData, 'pane-host', `panes-${PROTOCOL_VERSION}.sock`);
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

export type SpawnRequest = {
  key: string;
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

export type ToHost =
  | ({ type: 'spawn' } & SpawnRequest)
  | { type: 'write'; key: string; data: string }
  | { type: 'resize'; key: string; cols: number; rows: number }
  | { type: 'kill'; key: string };

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
};

export type FromHost =
  | { type: 'panes'; panes: Survivor[] }
  // Another app is connected; this one runs its shells itself.
  | { type: 'busy' }
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

export function line(message: ToHost | FromHost): string {
  return `${JSON.stringify(message)}\n`;
}
