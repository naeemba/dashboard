import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSE_LEASE_MS } from '../../shared/panes/pause-lease';
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
    pauses.pause('0:1');
    pauses.pause('0:1');
    pauses.resume('0:1');
    pauses.resume('0:1');
    expect(calls).toEqual(['pause', 'resume']);
  });

  it('resumes on its own when no resume comes, so a window that went away cannot leave a shell blocked', () => {
    const { made, calls } = shell();
    const pauses = outputPauses(new Map([['0:1', made]]));
    pauses.pause('0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS);
    expect(calls).toEqual(['pause', 'resume']);
    pauses.pause('0:1');
    expect(calls).toEqual(['pause', 'resume', 'pause']);
  });

  it('does nothing for a pane with no shell', () => {
    const pauses = outputPauses(new Map());
    pauses.pause('0:1');
    pauses.resume('0:1');
    vi.advanceTimersByTime(PAUSE_LEASE_MS);
  });
});
