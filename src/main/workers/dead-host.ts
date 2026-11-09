import { rmSync, writeFileSync } from 'node:fs';
import { canConnect } from '../app/can-connect';
import { readText } from '../app/missing-file';

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
//
// The number is acted on once and then forgotten, and one from an earlier boot is never read: after
// the leftovers end, the pid is anybody's, and a group by that number is not the host's. That leaves one
// window: the leftovers ending by themselves and the number coming round again, to a process whose own
// group outlives it, all before the next worker starts. A Mac has no boot id, so there a number
// written before a reboot is read after it.

type DeadHostPorts = {
  // The pid the last host wrote this boot, or null for none.
  recorded(): number | null;
  // Removes the record, once its number has been acted on.
  forget(): void;
  // process.kill's: a pid's signal, or a negative pid's to its whole group; 0 only asks.
  kill(pid: number, signal: NodeJS.Signals | 0): void;
};

export function endDeadHost(ports: DeadHostPorts): void {
  const pid = ports.recorded();
  if (pid === null || alive(ports, pid)) return;
  try {
    ports.kill(-pid, 'SIGKILL');
  } catch {
    // ESRCH: nothing of it was left.
  }
  ports.forget();
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

// Linux's, new each boot; empty where there is none.
function bootId(): string {
  return readText('/proc/sys/kernel/random/boot_id')?.trim() ?? '';
}

// Never 0 or 1, whose group signal would reach every process of the user, nor one written before
// `boot` began.
export function recordedPid(file: string, boot = bootId()): number | null {
  const [written = '', writtenBoot = ''] = (readText(file) ?? '').split('\n');
  const pid = Number(written.trim());
  return writtenBoot.trim() === boot && Number.isInteger(pid) && pid > 1 ? pid : null;
}

// The real ports, for a host starting (claimHostSocket's `before`) and for the app about to run a
// worker itself.
export function endDeadHostAt(socket: string): void {
  endDeadHost({ recorded: () => recordedPid(hostPidFile(socket)), forget: () => forgetHost(socket), kill: (pid, signal) => process.kill(pid, signal) });
}

// Whether the app may run a worker's session itself: not while a host answers on the socket, which
// may be running it, and otherwise once what the last host left is ended.
export async function endDeadHostUnlessAnswering(socket: string): Promise<boolean> {
  if (await canConnect(socket)) return false;
  endDeadHostAt(socket);
  return true;
}

export function recordHost(socket: string): void {
  writeFileSync(hostPidFile(socket), `${process.pid}\n${bootId()}\n`, { mode: 0o600 });
}

// A host that goes because nothing is left for it leaves no number behind for a later process to own.
export function forgetHost(socket: string): void {
  rmSync(hostPidFile(socket), { force: true });
}
