const platformDefault: Record<string, string> = {
  darwin: '/bin/zsh',
  win32: 'powershell.exe',
};

export function pickShell(
  environment: Record<string, string | undefined>,
  platform: string,
): string {
  return (
    environment.SHELL_COMMAND ||
    environment.SHELL ||
    platformDefault[platform] ||
    '/bin/bash'
  );
}

// A dropped path goes to the shell as a word, so anything the shell would read as syntax — a space, a
// quote, a `$` — has to be quoted first. Plain paths are let through bare because that is what a path is
// supposed to look like at a prompt.
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

// Both quote by wrapping in single quotes, and differ only on the one character single quotes cannot
// hold. A POSIX shell has to close, escape and reopen; PowerShell doubles it instead, and reads the
// POSIX form as a stray backslash. Keyed off the platform the way pickShell's fallback is, so a path
// dropped on Windows survives the same way it does on a Mac.
export function quoteForShell(value: string, platform: string): string {
  if (SHELL_SAFE.test(value)) return value;
  const escaped = platform === 'win32' ? value.replaceAll("'", "''") : value.replaceAll("'", "'\\''");
  return `'${escaped}'`;
}
