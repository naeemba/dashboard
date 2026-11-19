import { execFile } from 'node:child_process';

// The PATH a pane's shell builds from its startup files, which the app itself never read when it was
// started from a launcher: without it a hook running `node`, an MCP server started with `npx` or a
// worktree's `pnpm install` works typed in a pane and not from the app. An interactive shell may print
// a banner first, so the PATH is the last line; anything that goes wrong leaves the app's own.
export function pathFromShell(output: string, fallback: string): string {
  return output.split('\n').pop()?.trim() || fallback;
}

export function loginShellPath(fallback: string): Promise<string> {
  const shell = process.env.SHELL;
  if (!shell || process.platform === 'win32') return Promise.resolve(fallback);
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', 'printf %s "$PATH"'], { timeout: 5000, encoding: 'utf8' }, (error, output) => {
      resolve(error ? fallback : pathFromShell(output, fallback));
    });
  });
}
