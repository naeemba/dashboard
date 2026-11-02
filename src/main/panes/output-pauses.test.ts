import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSE_LEASE_MS } from '../../shared/panes/pause-lease';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import { outputPauses } from './output-pauses';
import type { PaneShell } from './pane-shell';

function shell() {
  const calls: string[] = [];
  const made = {
    pid: 1, process: 'zsh', cols: 80, rows: 24,
    write: () => undefined, resize: () => undefined, kill: () => undefined,
    pause: () => { calls.push('pause'); }, resume: () => { calls.push('resume'); },
    onData: () => undefined, onExit: () => undefined,
  } satisfies PaneShell;
  return { made, calls };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('outputPauses', () => {
  it('pauses once for a run of asks and resumes when told', () => {
    const { made, calls } = shell();
    const pauses = outputPauses(new Map([['0:1', made]]));
    pauses.pause(LOCAL_SCREEN, '0:1');
    pauses.pause(LOCAL_SCREEN, '0:1');
    pauses.resume(LOCAL_SCREEN, '0:1');
    pauses.resume(LOCAL_SCREEN, '0:1');
    expect(calls).toEqual(['pause', 'resume']);
  });

  it('resumes on its own when no resume comes, so a window that went away cannot leave a shell blocked', () => {
    const { made, calls } = shell();
    const pauses = outputPauses(new Map([['0:1', made]]));
    pauses.pause(LOCAL_SCREEN, '0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS);
    expect(calls).toEqual(['pause', 'resume']);
    pauses.pause(LOCAL_SCREEN, '0:1');
    expect(calls).toEqual(['pause', 'resume', 'pause']);
  });

  it('holds the pause a full lease from the last ask', () => {
    const { made, calls } = shell();
    const pauses = outputPauses(new Map([['0:1', made]]));
    pauses.pause(LOCAL_SCREEN, '0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS - 1);
    pauses.pause(LOCAL_SCREEN, '0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS - 1);
    expect(calls).toEqual(['pause']);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['pause', 'resume']);
  });

  it('pauses a shell that replaced a paused one, and the old lease never resumes it', () => {
    const old = shell();
    const replacement = shell();
    const shells = new Map([['0:1', old.made]]);
    const pauses = outputPauses(shells);
    pauses.pause(LOCAL_SCREEN, '0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS / 2);
    shells.set('0:1', replacement.made);
    pauses.pause(LOCAL_SCREEN, '0:1');
    expect(replacement.calls).toEqual(['pause']);
    vi.advanceTimersByTime(PAUSE_LEASE_MS - 1);
    expect(replacement.calls).toEqual(['pause']);
    vi.advanceTimersByTime(1);
    expect(replacement.calls).toEqual(['pause', 'resume']);
    expect(old.calls).toEqual(['pause']);
  });

  it('ignores a remote screen, so it cannot pause or resume the desk\'s shells', () => {
    const { made, calls } = shell();
    const pauses = outputPauses(new Map([['0:1', made]]));
    pauses.pause('screen-1', '0:1');
    expect(calls).toEqual([]);
    pauses.pause(LOCAL_SCREEN, '0:1');
    pauses.resume('screen-1', '0:1');
    expect(calls).toEqual(['pause']);
  });

  it('does nothing for a pane with no shell', () => {
    const pauses = outputPauses(new Map());
    pauses.pause(LOCAL_SCREEN, '0:1');
    pauses.resume(LOCAL_SCREEN, '0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS);
  });
});
