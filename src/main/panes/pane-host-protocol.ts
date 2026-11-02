import path from 'node:path';

// What the app and the pane host say to each other: one JSON message per line over a unix socket.
// panes-decision-1 says why the shells live in a process of their own.

// In the socket's name, so an app built against another shape of these messages never talks to a host
// that would misread them. It starts a host of its own instead, and the old host's shells run on
// unseen until they exit. Bump it with any change to the types below.
const PROTOCOL_VERSION = 1;

// In a folder of its own, made private before the socket is: anyone who can reach the socket can type
// into every shell. The user-data folder, not the temporary one, so a second Dashboard on its own user
// data (a demo instance, a development build) has a host of its own and never adopts the other's shells.
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
  | { type: 'spawned'; key: string; pid: number }
  | { type: 'data'; key: string; data: string }
  | { type: 'exit'; key: string; code: number }
  | { type: 'foreground'; key: string; name: string };

// Cuts a stream into its lines and hands each one on parsed. A chunk ends wherever the socket put it,
// often in the middle of a message, so the unfinished end is kept for the next chunk.
export function lineReader<T>(message: (value: T) => void): (chunk: string) => void {
  let unfinished = '';
  return (chunk) => {
    const lines = (unfinished + chunk).split('\n');
    unfinished = lines.pop() ?? '';
    for (const line of lines) if (line !== '') message(JSON.parse(line) as T);
  };
}

export function line(message: ToHost | FromHost): string {
  return `${JSON.stringify(message)}\n`;
}
