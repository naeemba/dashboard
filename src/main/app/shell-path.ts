import { execFile, execFileSync } from 'node:child_process';

// The PATH a pane's shell builds from its startup files, which the app itself never read when it was
// started from a launcher: without it a hook running `node`, an MCP server started with `npx` or a
// worktree's `pnpm install` works typed in a pane and not from the app. An interactive shell may print
// a banner first, so the PATH is the last line; anything that goes wrong leaves the app's own.
export function pathFromShell(output: string, fallback: string): string {
  return lastLine(output) || fallback;
}

function lastLine(output: string): string {
  return output.split('\n').pop()?.trim() ?? '';
}

// The shell whose startup files are read, or none: Windows has no POSIX shell to ask.
function loginShell(): string | undefined {
  return process.platform === 'win32' ? undefined : process.env.SHELL || undefined;
}

const LOGIN_SHELL_TIMEOUT_MS = 5000;

function printArguments(variable: string): string[] {
  return ['-ilc', `printf %s "$${variable}"`];
}

export function loginShellPath(fallback: string): Promise<string> {
  const shell = loginShell();
  if (shell === undefined) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    execFile(shell, printArguments('PATH'), { timeout: LOGIN_SHELL_TIMEOUT_MS, encoding: 'utf8' }, (error, output) => {
      resolve(error ? fallback : pathFromShell(output, fallback));
    });
  });
}

// One variable as the login shell sets it, waited for: for a value every spawn needs that is read once
// at launch, before anything is spawned (ssh-agent.ts), by a shell started with `environment`. Nothing
// when there is no shell or it prints nothing. A shell whose rc leaves a background job holding stdout
// times out though it printed the value, so what it printed is still read; the caller checks it.
export function loginShellValue(variable: string, environment: NodeJS.ProcessEnv): string | undefined {
  const shell = loginShell();
  if (shell === undefined) return undefined;
  try {
    const output = execFileSync(shell, printArguments(variable), {
      timeout: LOGIN_SHELL_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: environment,
    });
    return lastLine(output) || undefined;
  } catch (error) {
    return lastLine((error as { stdout?: string }).stdout ?? '') || undefined;
  }
}
