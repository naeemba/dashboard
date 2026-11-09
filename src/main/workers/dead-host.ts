import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { attempt } from '../panes/host-socket';
import { prepareHostSocket } from '../panes/pane-host-protocol';

// What a screen host that died leaves running: its sessions. The Agent SDK starts each worker's Claude
// in the host's process group (the host starts detached, so the group is its pid), and nothing tells
// them when the host is killed: earlyoom's SIGKILL on 2026-11-09 left four running with parent pid 1,
// each still at its turn, while the next host resumed the same conversations (workers-decision-6).
//
// So the host writes its pid beside its socket, and whatever starts a worker's session where the host
// was (the next host, or the app running it itself) kills that group first. Only once the pid is dead:
// Linux never hands a pid out again while a process group still carries it, so a dead pid's group is
// the host's leftovers or nothing. A pid that is alive is the host still going, or the number reused by
// a process with no group of the host's left to share it, and is left alone either way.

export type DeadHostPorts = {
  // The pid the last host wrote, or null for none.
  recorded(): number | null;
  // process.kill's: a pid's signal, or a negative pid's to its whole group; 0 only asks.
  kill(pid: number, signal: NodeJS.Signals | 0): void;
};

// Whether the group of the host recorded was killed.
export function endDeadHost(ports: DeadHostPorts): boolean {
  const pid = ports.recorded();
  if (pid === null || alive(ports, pid)) return false;
  try {
    ports.kill(-pid, 'SIGKILL');
    return true;
  } catch {
    // ESRCH: nothing of it was left.
    return false;
  }
}

function alive(ports: DeadHostPorts, pid: number): boolean {
  try {
    ports.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM is a process there that is not ours to signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// Beside the socket, so a second Dashboard on its own user data has a host and a file of its own.
export function hostPidFile(socket: string): string {
  return `${socket}.pid`;
}

export function recordedPid(file: string): number | null {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    return Number.isInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

// The real ports, for the host's own start and for the app about to run a worker in its place.
export function endDeadHostAt(socket: string): boolean {
  return endDeadHost({ recorded: () => recordedPid(hostPidFile(socket)), kill: (pid, signal) => process.kill(pid, signal) });
}

// Whether a host starting may listen on the socket. Not while another answers on it: taking the socket
// from a live host leaves its sessions running where no app can reach them, and the next start of each
// worker runs a second copy here. Otherwise what the last host left is ended before the first app can
// connect and start a worker again.
export async function claimHostSocket(platform: string, socket: string): Promise<boolean> {
  const other = await attempt(socket);
  if (other !== null) {
    other.destroy();
    return false;
  }
  endDeadHostAt(socket);
  prepareHostSocket(platform, socket);
  return true;
}

export function recordHost(socket: string): void {
  writeFileSync(hostPidFile(socket), `${process.pid}\n`, { mode: 0o600 });
}

// A host that goes because nothing is left for it leaves no number behind for a later process to own.
export function forgetHost(socket: string): void {
  rmSync(hostPidFile(socket), { force: true });
}
