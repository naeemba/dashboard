// Which socket a command asks the app on, starting the app first when none answers. Only commands that
// need the running app come here (`pane ...`, `project open/close/focus`); the board and the project
// list work on files and never start it, or a Claude session in another repo listing its cards would
// make a window pop up.
//
// Starting the app is what the person running the command asked for in that moment; quitting,
// restarting or replacing it is never this command's.

// Long enough for a cold start with every project's shells to spawn, short enough to be told why
// before reaching for Ctrl-C.
export const LAUNCH_TIMEOUT = 30000;
const POLL_INTERVAL = 250;

export type ReachPorts = {
  // DASHBOARD_SOCKET: the app that opened this pane, which may have quit since.
  paneSocket: string | undefined;
  // The socket the app last wrote to its userData folder (app-address.ts), read fresh each time.
  pointed(): string | null;
  connects(socketPath: string): Promise<boolean>;
  // Starts the app detached, or null when this command does not know where the app is.
  start: (() => void) | null;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
};

export type Reached = { ok: true; socket: string } | { ok: false; message: string };

// A worker's hook reports with notify from wherever it stands; an app it starts would be one nobody
// asked for, so a hook whose app has quit is answered with the line instead.
export function mayStartApp(commandArguments: readonly string[]): boolean {
  return commandArguments[0] !== 'notify';
}

export const NOT_RUNNING = 'no Dashboard is running — start it with `dashboard`';

export function launchTimedOut(milliseconds: number): string {
  return `started Dashboard, but it did not answer within ${milliseconds / 1000} seconds — `
    + 'if its window is up, ask again; if not, start it with `dashboard` and read what it says';
}

export async function reachApp(ports: ReachPorts, mayStart: boolean, timeout = LAUNCH_TIMEOUT): Promise<Reached> {
  // The pane's own app first, then whichever one wrote the file: a pane whose app was restarted
  // reaches the new one.
  for (const candidate of [ports.paneSocket, ports.pointed()]) {
    if (candidate && await ports.connects(candidate)) return { ok: true, socket: candidate };
  }
  if (!mayStart || ports.start === null) return { ok: false, message: NOT_RUNNING };
  ports.start();
  const deadline = ports.now() + timeout;
  while (ports.now() < deadline) {
    await ports.sleep(POLL_INTERVAL);
    const pointed = ports.pointed();
    if (pointed && await ports.connects(pointed)) return { ok: true, socket: pointed };
  }
  return { ok: false, message: launchTimedOut(timeout) };
}
