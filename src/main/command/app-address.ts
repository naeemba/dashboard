import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { failureText } from '../../shared/errors/failure';

// How a command run outside the app's panes finds the app. A pane is handed DASHBOARD_SOCKET; a plain
// terminal is handed nothing, and the socket is made fresh in a random folder each launch
// (session-socket.ts says why). So the app also writes the socket's path into a file in its userData
// folder, and the command reads it from there.
//
// The file holds only a path. Reaching the socket still takes getting into the 0700 folder it sits in,
// so the file opens nothing that was not open before; it is written 0600 all the same.

export const SOCKET_POINTER_FILE = 'session-socket';

// The folder Electron's app.getPath('userData') answers with for this app, worked out without Electron:
// the command runs under plain node. A pane names it in DASHBOARD_USER_DATA, which wins, so a pane of a
// copy started with --user-data-dir reaches that copy and not the installed one.
export function userDataFolder(platform: string, environment: NodeJS.ProcessEnv, home: string): string {
  if (environment.DASHBOARD_USER_DATA) return environment.DASHBOARD_USER_DATA;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Dashboard');
  if (platform === 'win32') return path.join(environment.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Dashboard');
  return path.join(environment.XDG_CONFIG_HOME || path.join(home, '.config'), 'Dashboard');
}

export function writeSocketPointer(userData: string, socketPath: string): void {
  writeFileSync(path.join(userData, SOCKET_POINTER_FILE), socketPath, { mode: 0o600 });
}

// writeSocketPointer for main, once the socket listens: a failure leaves panes working and only a plain
// terminal unable to find the app, so it is held for the window rather than thrown.
export function announceSocket(userData: string, socketPath: string, hold: (message: string) => void): void {
  try {
    writeSocketPointer(userData, socketPath);
  } catch (error: unknown) {
    hold(`The dashboard command outside a pane cannot find this app: ${failureText(error)}`);
  }
}

// The socket the app last said it listens on, or null when no app has said so.
export function readSocketPointer(userData: string): string | null {
  try {
    return readFileSync(path.join(userData, SOCKET_POINTER_FILE), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// Removed at quit only while it still names this app's socket: a second copy on the same userData is
// refused by the single-instance lock before it gets here, but a file naming somebody else's socket is
// not this app's to remove.
export function clearSocketPointer(userData: string, socketPath: string): void {
  if (readSocketPointer(userData) === socketPath) rmSync(path.join(userData, SOCKET_POINTER_FILE), { force: true });
}
