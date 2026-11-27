import { isRecord } from '../../shared/app/is-record';

// Whether a process id names a running process: signal 0 asks without sending anything. EPERM is a
// process that runs but is not ours to signal; anything else (ESRCH) is none. The dead screen host's
// sweep (dead-host.ts) and the pane pool's CI waits (liveWaits) both ask it.
export function processAlive(pid: number, signal: (pid: number, signal: 0) => unknown = process.kill): boolean {
  try {
    signal(pid, 0);
    return true;
  } catch (error: unknown) {
    return isRecord(error) && error.code === 'EPERM';
  }
}
