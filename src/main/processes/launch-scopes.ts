import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LogDraft } from '../../shared/app/log-entry';
import { bind, isRefused } from '../actions/action';
import { processesInstallSlices, systemdUserFolder } from '../actions/processes/install-slices';
import { commandOutput } from '../panes/shell-directory-lookup';
import { processScopes, type ProcessScopes, type Probe } from './scope-support';

// The app's scopes with their real ports: the two probes, the slice files and daemon-reload. The
// probe's and the file's branches are tested in launch-scopes.test.ts against real processes and a
// real folder; everything they hand over to is tested beside it.

const runCommand = promisify(execFile);
// daemon-reload answers in milliseconds; one stuck must not hold the launch for long.
const RELOAD_TIMEOUT_MS = 3_000;

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

export function launchScopes(log: (draft: LogDraft) => void): ProcessScopes {
  const install = bind(processesInstallSlices, {
    writeNew,
    reload: async () => { await runCommand('systemctl', ['--user', 'daemon-reload'], { timeout: RELOAD_TIMEOUT_MS }); },
  });
  return processScopes({
    platform: process.platform,
    probe,
    async prepare() {
      const installed = await install.call({ folder: systemdUserFolder(process.env, homedir()) });
      if (isRefused(installed)) throw new Error(installed.refused);
      if (installed.written.length > 0) log({ level: 'info', kind: 'app', action: install.name, message: installed.output });
    },
    warn: (message) => log({ level: 'warn', kind: 'app', action: 'processes.scopes', message }),
  });
}
