import { randomBytes } from 'node:crypto';
import { failureText } from '../../shared/errors/failure';
import { scopedCommand, type ScopedCommand, type ScopeRequest } from './scope';

// Whether this machine can put a process in a systemd scope, asked once at launch and kept, and the
// one place the app's scoped commands are made, so every name it hands out is known to it. Nothing
// here blocks a start: until the answer is in, and after any failure, every command runs unscoped.

// What a probe printed, or null when it printed nothing: not installed, or no user manager to ask.
// A probe that exits non-zero still answers what it printed (`is-system-running` says `degraded`
// with exit 1 on most desktops).
export type Probe = (file: string, args: string[]) => Promise<string | null>;

// What `systemctl --user is-system-running` prints when the user manager is up and taking units.
const MANAGER_UP = new Set(['initializing', 'starting', 'running', 'degraded']);

// Null when scopes can be used on Linux, or the sentence saying why they cannot, from what the two
// probes printed.
export function scopeRefusal(systemdRun: string | null, managerState: string | null): string | null {
  if (systemdRun === null) return 'systemd-run is not installed';
  if (managerState === null || !MANAGER_UP.has(managerState)) {
    return `the systemd user manager is not taking units (${managerState ?? 'no answer'})`;
  }
  return null;
}

export type ProcessScopesPorts = {
  platform: string;
  probe: Probe;
  // The slice units written where missing, and systemd told (install-slices.ts). A failure costs the
  // slices' caps, not the scopes: systemd makes a slice that has no unit file on its own, uncapped.
  prepare(): Promise<void>;
  warn(message: string): void;
  suffix?(): string;
};

export type ProcessScopes = {
  // Settled once the check (and the slices) are done, whichever way it went. Never rejects.
  ready: Promise<void>;
  scoped(request: ScopeRequest): ScopedCommand;
};

export function processScopes(ports: ProcessScopesPorts): ProcessScopes {
  let available = false;
  // ponytail: only the names this run handed out; a name a previous run's pane host still holds
  // collides one time in 36^4 for the same pane, and that start's systemd-run exits with an error.
  const issued = new Set<string>();
  const support = {
    get available() { return available; },
    suffix: ports.suffix ?? randomSuffix,
    taken: (unit: string) => issued.has(unit),
  };

  async function check(): Promise<void> {
    // Not worth a line where scopes were never going to be: every Mac and Windows launch.
    if (ports.platform !== 'linux') return;
    const refusal = scopeRefusal(
      await ports.probe('systemd-run', ['--version']),
      await ports.probe('systemctl', ['--user', 'is-system-running']),
    );
    if (refusal !== null) {
      ports.warn(`Panes and agents run without systemd scopes: ${refusal}`);
      return;
    }
    try {
      await ports.prepare();
    } catch (error: unknown) {
      ports.warn(`The agents and panes slices were not installed, so they run uncapped: ${failureText(error)}`);
    }
    available = true;
  }

  return {
    ready: check().catch((error: unknown) => ports.warn(`Panes and agents run without systemd scopes: ${failureText(error)}`)),
    scoped(request) {
      const command = scopedCommand(request, support);
      if (command.unit !== null) issued.add(command.unit);
      return command;
    },
  };
}

const SUFFIX_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(): string {
  return [...randomBytes(4)].map((byte) => SUFFIX_LETTERS[byte % SUFFIX_LETTERS.length]).join('');
}
