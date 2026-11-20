import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LogDraft } from '../../shared/app/log-entry';
import { bind, isRefused } from '../actions/action';
import { processesInstallSlices, systemdUserFolder } from '../actions/processes/install-slices';
import { processesStopEarlierMains } from '../actions/processes/stop-earlier-mains';
import { agentScopeDescription, boundUnit, mainScopeDescription } from './main-scopes';
import { commandOutput } from '../panes/shell-directory-lookup';
import { processScopes, type ProcessScopes, type Probe } from './scope-support';

// The app's scopes with their real ports: the two probes, the slice files, daemon-reload and stopping
// a pane's scope. The probe's and the file's branches are tested in launch-scopes.test.ts against real
// processes and a real folder; everything they hand over to is tested beside it.

const runCommand = promisify(execFile);
// daemon-reload and a queued stop answer in milliseconds; one stuck must not hold a launch or a close.
const SYSTEMCTL_TIMEOUT_MS = 3_000;
// What `systemctl stop` exits with for a unit that is not loaded: a scope already ended and collected,
// or one a pane host from before scopes never started. Either way there is nothing left to stop.
const NOT_LOADED = 5;
// An earlier launch's main stopped with its MCP servers: SIGTERM ends a CLI in about a second, and a
// stop that takes longer is read back as still running rather than held for systemd's 90 seconds.
const MAIN_STOP_TIMEOUT_MS = 10_000;

// commandOutput keeps what a non-zero exit printed (`degraded`); a missing program printed nothing.
export const probe: Probe = async (file, args) => (await commandOutput(file, args))?.trim() || null;

export function writeNew(file: string, text: string): boolean {
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    writeFileSync(file, text, { flag: 'wx' });
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

// A pane's scope stopped: systemd ends every process left in it, SIGTERM then SIGKILL. --no-block
// queues the stop and returns, so a dev server that ignores SIGTERM does not hold the close for the
// 90 seconds systemd gives it.
export async function stopScope(unit: string): Promise<void> {
  try {
    await runCommand('systemctl', ['--user', 'stop', '--no-block', unit], { timeout: SYSTEMCTL_TIMEOUT_MS });
  } catch (error: unknown) {
    if ((error as { code?: unknown }).code !== NOT_LOADED) throw error;
  }
}

// Every main this run started, stopped as the app quits, without waiting: --no-block hands the stop to
// systemd, which carries it out after the app has gone. A unit already ended is skipped by systemctl,
// which goes on to the rest.
export function stopMainsNow(units: readonly string[]): void {
  if (units.length === 0) return;
  try {
    execFileSync('systemctl', ['--user', 'stop', '--no-block', ...units], { timeout: SYSTEMCTL_TIMEOUT_MS, stdio: 'ignore' });
  } catch {
    // ponytail: a quit says nothing; the next launch stops what this left (processes-decision-6).
  }
}

function appCgroup(): string {
  try {
    return readFileSync('/proc/self/cgroup', 'utf8');
  } catch {
    return '';
  }
}

// `owner` is the app's userData folder, which a main's scope names (main-scopes.ts).
export function launchScopes(log: (draft: LogDraft) => void, owner: string): ProcessScopes {
  const install = bind(processesInstallSlices, {
    writeNew,
    reload: async () => { await runCommand('systemctl', ['--user', 'daemon-reload'], { timeout: SYSTEMCTL_TIMEOUT_MS }); },
  });
  const stopEarlier = bind(processesStopEarlierMains, {
    list: async () => (await runCommand('systemctl', ['--user', 'show', '--property=Id,ActiveState,Description', 'agent-main-*'], { timeout: SYSTEMCTL_TIMEOUT_MS })).stdout,
    stop: async (units) => { await runCommand('systemctl', ['--user', 'stop', ...units], { timeout: MAIN_STOP_TIMEOUT_MS }); },
  });
  const launch = randomUUID().slice(0, 8);
  return processScopes({
    platform: process.platform,
    probe,
    async prepare() {
      const installed = await install.call({ folder: systemdUserFolder(process.env, homedir()) });
      if (isRefused(installed)) throw new Error(installed.refused);
      if (installed.written.length > 0) log({ level: 'info', kind: 'app', action: install.name, message: installed.output });
    },
    warn: (message) => log({ level: 'warn', kind: 'app', action: 'processes.scopes', message }),
    mainScope: { description: mainScopeDescription(owner, launch), boundTo: boundUnit(appCgroup()) },
    agentDescription: agentScopeDescription(owner),
    async stopEarlierMains() {
      const result = await stopEarlier.call({ owner, launch });
      if (isRefused(result)) throw new Error(result.refused);
      if (result.stopped.length + result.left.length > 0) log({ level: result.left.length > 0 ? 'warn' : 'info', kind: 'app', action: stopEarlier.name, message: result.output });
      return result.left;
    },
  });
}
