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

// PowerShell is the one shell here that does not quote the POSIX way. Both wrap the word in single
// quotes and differ only on a literal quote inside it: a POSIX shell has to close, escape and reopen,
// PowerShell doubles it, and each reads the other's form as garbage. Keyed off the shell that will
// actually receive the word rather than the platform, because SHELL_COMMAND lets a Mac run pwsh and
// Windows run git-bash. cmd.exe has no single-quote quoting at all and is not supported.
const POWERSHELL = /^(powershell|pwsh)(\.exe)?$/i;

export function quoteForShell(value: string, shellCommand: string): string {
  if (SHELL_SAFE.test(value)) return value;
  const shellName = shellCommand.split(/[\\/]/).pop() ?? '';
  const escaped = POWERSHELL.test(shellName)
    ? value.replaceAll("'", "''")
    : value.replaceAll("'", "'\\''");
  return `'${escaped}'`;
}

// main resolves the shell after loading the .env file, so it can only reach the preload as a launch
// argument. Both ends spell the flag from here, so a rename cannot leave the renderer quoting for the
// wrong shell with nothing failing.
export const SHELL_COMMAND_FLAG = '--shell-command=';
