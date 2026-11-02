import { PAUSE_LEASE_MS } from '../../shared/panes/pause-lease';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import type { PaneShell } from './pane-shell';

// A pane's pty stops being read while the window's terminal for it has more than it can draw queued
// (renderer/panes/write-flow.ts asks), so a program printing flat out blocks on its own writes instead
// of piling seconds of output between itself and the screen. Ctrl+C then stops what you see at once,
// not after the backlog has drawn (docs/performance/history.md, finding 7).
//
// Each pause is a lease. A window that reloads, crashes, or goes to show another host never sends the
// resume, and a shell left paused would block forever on its next write: a build you cannot see,
// stopped. So a pause lapses on its own a lease after the last ask; a window still behind asks again,
// which renews it.
//
// Only this machine's window is heard. A remote screen's resume would undo the window's pause and the
// other way round, so a slower screen keeps the backlog it had before.
//
// A lease belongs to the shell it paused, not to the pane id: a ship that replaces a paused pane's shell
// leaves the old lease behind, and the new shell is paused, renewed and resumed on its own.
export function outputPauses(shells: ReadonlyMap<string, PaneShell>) {
  const leases = new Map<string, { shell: PaneShell; timer: ReturnType<typeof setTimeout> }>();

  function resume(screen: string, id: string): void {
    const lease = leases.get(id);
    if (screen !== LOCAL_SCREEN || lease === undefined) return;
    clearTimeout(lease.timer);
    leases.delete(id);
    if (shells.get(id) === lease.shell) lease.shell.resume();
  }

  function pause(screen: string, id: string): void {
    const shell = shells.get(id);
    if (screen !== LOCAL_SCREEN || shell === undefined) return;
    const lease = leases.get(id);
    if (lease !== undefined) clearTimeout(lease.timer);
    if (lease?.shell !== shell) shell.pause();
    leases.set(id, { shell, timer: setTimeout(() => resume(LOCAL_SCREEN, id), PAUSE_LEASE_MS) });
  }

  return { pause, resume };
}
