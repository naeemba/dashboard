import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { loginShellValue } from './shell-path';

// The SSH agent every session, pane shell and pane host child reaches git over. An app started from a
// launcher on Linux can have no SSH_AUTH_SOCK, or one naming a socket that is gone, while the desktop's
// agent runs: on 2026-11-25 every push a worker made over SSH failed with `Permission denied
// (publickey)`, though `systemctl --user show-environment` named the gcr agent's socket. So at launch
// the app's own is kept when its socket is there, else the systemd user environment's, else the login
// shell's. Read once into process.env before the pane environment is built from it (main.ts), so
// main's own git, the pane host it launches and every pane and session all get it.

export type AgentSources = {
  systemd(): string | undefined;
  loginShell(): string | undefined;
  isSocket(path: string): boolean;
};

// The socket to use: the first of the app's own, systemd's and the login shell's that is a live
// socket, each asked only when the one before is not. Nothing when none is live.
export function sshAgentSocket(own: string | undefined, sources: AgentSources): string | undefined {
  if (own && sources.isSocket(own)) return own;
  for (const read of [sources.systemd, sources.loginShell]) {
    const found = read();
    if (found && sources.isSocket(found)) return found;
  }
  return undefined;
}

const VARIABLE = 'SSH_AUTH_SOCK';
const SYSTEMCTL_TIMEOUT_MS = 2000;

// SSH_AUTH_SOCK out of `systemctl --user show-environment`, one NAME=value a line, quoted when the
// value has whitespace. systemd prints a `#` bare, so a `#` in the path cuts it short here.
export function fromShowEnvironment(output: string): string | undefined {
  return parseEnv(output)[VARIABLE] || undefined;
}

function systemdValue(): string | undefined {
  try {
    const output = execFileSync('systemctl', ['--user', 'show-environment'], {
      timeout: SYSTEMCTL_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return fromShowEnvironment(output);
  } catch {
    return undefined;
  }
}

function isSocket(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isSocket() ?? false;
}

// Sets process.env.SSH_AUTH_SOCK as sshAgentSocket says, on Linux; with none live it stays as it was.
// A launch with no agent anywhere waits on both reads, the login shell's about 0.1 s on a plain zshrc.
// The login shell starts without the app's own value, which by then was rejected: an rc that sets the
// variable only when it is empty would otherwise hand the dead socket back. An rc that runs
// `eval $(ssh-agent)` when it is empty starts a new agent, with no keys, on such a launch.
export function adoptSshAgent(): void {
  if (process.platform !== 'linux') return;
  const withoutOwn = { ...process.env, [VARIABLE]: undefined };
  const socket = sshAgentSocket(process.env[VARIABLE], {
    systemd: systemdValue, loginShell: () => loginShellValue(VARIABLE, withoutOwn), isSocket,
  });
  if (socket !== undefined) process.env[VARIABLE] = socket;
}
