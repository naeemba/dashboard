import { PAUSE_LEASE_MS } from '../../shared/panes/pause-lease';
import type { PaneShell } from './pane-shell';

// A pane's pty stops being read while the window's terminal for it has more than it can draw queued
// (renderer/panes/write-flow.ts asks), so a program printing flat out blocks on its own writes instead
// of piling seconds of output between itself and the screen. Ctrl+C then stops what you see at once,
// not after the backlog has drawn (docs/performance/history.md, finding 7).
//
// Each pause is a lease. A window that reloads, crashes, or goes to show another host never sends the
// resume, and a shell left paused would block forever on its next write: a build you cannot see,
// stopped. So a pause lapses on its own; a window still behind renews it.

export function outputPauses(shells: ReadonlyMap<string, PaneShell>) {
  const leases = new Map<string, ReturnType<typeof setTimeout>>();

  function resume(id: string): void {
    const lease = leases.get(id);
    if (lease === undefined) return;
    clearTimeout(lease);
    leases.delete(id);
    shells.get(id)?.resume();
  }

  function pause(id: string): void {
    const shell = shells.get(id);
    if (shell === undefined || leases.has(id)) return;
    shell.pause();
    leases.set(id, setTimeout(() => resume(id), PAUSE_LEASE_MS));
  }

  return { pause, resume };
}
