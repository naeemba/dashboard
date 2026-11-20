import { randomInt } from 'node:crypto';
import { failureText } from '../../shared/errors/failure';
import { SCOPE_RUNNER } from '../../shared/processes/scope-runner';
import { heldRefusal, mainHolder } from './main-scopes';
import { scopedCommand, type ScopedCommand, type ScopeRequest, type ScopeSupport } from './scope';

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
  // What a main's scope carries (main-scopes.ts), read once scopes are known to work.
  mainScope?(): NonNullable<ScopeSupport['main']>;
  // The scopes an earlier launch's mains run in, stopped; answers the ones still running after.
  stopEarlierMains?(): Promise<readonly string[]>;
};

export type ProcessScopes = {
  // Settled once the check (and the slices) are done, whichever way it went. Never rejects.
  ready: Promise<void>;
  scoped(request: ScopeRequest): ScopedCommand;
  // A Claude session's command, once the check has answered and an earlier launch's mains are stopped.
  // Rejects for a main one of those still holds the name of: two CLIs under one name, and its workers'
  // reports reach the other one (processes-decision-6).
  session(request: ScopeRequest): Promise<ScopedCommand>;
  // Every main's unit this run handed out, for the quit to stop.
  mains(): string[];
};

export function processScopes(ports: ProcessScopesPorts): ProcessScopes {
  let available = false;
  // For collisions only, never a list of the scopes there are: systemd has that, under the two slices.
  // ponytail: only the names this run handed out; a name a previous run's pane host still holds
  // collides one time in 36^4 for the same pane, and that start's systemd-run exits with an error.
  const issued = new Set<string>();
  const mains = new Set<string>();
  let main: ScopeSupport['main'];
  const support: ScopeSupport = {
    get available() { return available; },
    suffix: ports.suffix ?? randomSuffix,
    taken: (unit: string) => issued.has(unit),
    get main() { return main; },
  };

  async function check(): Promise<void> {
    // Not worth a line where scopes were never going to be: every Mac and Windows launch.
    if (ports.platform !== 'linux') return;
    const [systemdRun, managerState] = await Promise.all([
      ports.probe(SCOPE_RUNNER, ['--version']),
      ports.probe('systemctl', ['--user', 'is-system-running']),
    ]);
    const refusal = scopeRefusal(systemdRun, managerState);
    if (refusal !== null) {
      ports.warn(`Panes and agents run without systemd scopes: ${refusal}`);
      return;
    }
    try {
      await ports.prepare();
    } catch (error: unknown) {
      ports.warn(`The agents and panes slices were not installed, so they run uncapped: ${failureText(error)}`);
    }
    main = ports.mainScope?.();
    available = true;
  }

  // Never rejects: a stop that could not even be asked leaves nothing known to refuse on.
  async function stopEarlierMains(): Promise<readonly string[]> {
    await ready;
    if (!available || ports.stopEarlierMains === undefined) return [];
    return ports.stopEarlierMains().catch((error: unknown) => {
      ports.warn(`Main sessions from an earlier launch were not stopped: ${failureText(error)}`);
      return [];
    });
  }

  function scoped(request: ScopeRequest): ScopedCommand {
    const command = scopedCommand(request, support);
    if (command.unit !== null) issued.add(command.unit);
    if (command.unit !== null && request.kind === 'main') mains.add(command.unit);
    return command;
  }

  const ready = check().catch((error: unknown) => ports.warn(`Panes and agents run without systemd scopes: ${failureText(error)}`));
  let left = stopEarlierMains();

  return {
    ready,
    scoped,
    async session(request) {
      if (request.kind === 'main') {
        // Asked again first: one stopped by hand since, or slow to stop at launch, is not refused on.
        if (mainHolder(request.id, await left) !== null) left = stopEarlierMains();
        const holder = mainHolder(request.id, await left);
        if (holder !== null) throw new Error(heldRefusal(request.id, holder));
      }
      await ready;
      return scoped(request);
    },
    mains: () => [...mains],
  };
}

const SUFFIX_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(): string {
  return Array.from({ length: 4 }, () => SUFFIX_LETTERS[randomInt(SUFFIX_LETTERS.length)]).join('');
}
