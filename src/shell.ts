import { baseName } from './base-name';
import type { Settings } from './settings';

const platformDefault: Record<string, string> = {
  darwin: '/bin/zsh',
  win32: 'powershell.exe',
};

// The settings file wins, then the two environment variables, then the platform. An empty
// shellCommand is the file saying "work it out", which is what it holds until someone sets one.
export function pickShell(
  settings: Settings,
  environment: Record<string, string | undefined>,
  platform: string,
): string {
  return (
    settings.shellCommand ||
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

export function isPowerShell(shellCommand: string): boolean {
  return POWERSHELL.test(baseName(shellCommand));
}

// One word in single quotes the way every POSIX shell reads them. Inside single quotes the only way
// to write an apostrophe is to shut the quotes, escape it, and open them again. Exported because the
// review prompt builds shell lines for an agent to run and needs the same escape — two copies of this
// formula is one of them getting an edge case fixed and the other not.
//
// Always quotes, unlike quoteForShell below, which lets a plain path through bare so a dropped path
// still looks like a path at a prompt.
export function posixQuoted(word: string): string {
  return `'${word.replaceAll("'", "'\\''")}'`;
}

export function quoteForShell(value: string, shellCommand: string): string {
  if (SHELL_SAFE.test(value)) return value;
  if (isPowerShell(shellCommand)) return `'${value.replaceAll("'", "''")}'`;
  return posixQuoted(value);
}

// The editor pane runs nvim, and nvim has to be found on PATH. An app launched from the Dock inherits
// almost none of one — /usr/bin and /bin, no Homebrew — so the exec fails and the pane shows "[exited 1]"
// before it ever draws. Running nvim through the shell is what gives it a PATH the user recognises.
// Login and interactive, because the PATH is split across both halves and nvim needs all of it:
// `brew shellenv` lives in .zprofile, which only -l reads, while fnm, nvm, rbenv, pyenv and mise all
// initialise from .zshrc, which only -i reads. Take just one and nvim's language servers fail with
// "node: command not found" while the terminal pane beside them runs node fine. The five panes spawn an
// interactive shell, so -i is also what makes this the same PATH they have, as advertised. The rc file
// costs about three quarters of a second, paid once when you first press Ctrl+N for a project, not per
// keystroke. `exec` leaves nvim as the pane's only process rather than parking a shell above it for as
// long as the pane is open.
//
// `--listen` is how anything else reaches this nvim once it is up: Ctrl+` sends the focused pane's
// scrollback to it over that socket. nvim creates the socket as it starts, well before its plugins
// finish, so the wait is the shell's startup and nothing more.
//
// `-c set title titlestring=%t` is what makes the editor pane say which file it has open. nvim's
// 'title' is off by default, so without it nvim never prints the title escape sequence and the pane
// reads a bare `nvim` forever. `titlestring` is set with it because nvim's own default title is
// `board.json (/Users/you/project) - Nvim` — the folder you are already in, and a second "Nvim" after
// the one paneLabel puts at the front — and the status bar is one line with no room for it. `%t` is
// the file's tail, so the pane reads `nvim · board.json`. `-c` runs after the user's config, so it
// wins over a config that left 'title' off or set a titlestring of its own.
export function editorArguments(shellCommand: string, socket: string): string[] {
  const command = `nvim --listen ${quoteForShell(socket, shellCommand)} `
    + `-c ${quoteForShell('set title titlestring=%t', shellCommand)}`;
  return isPowerShell(shellCommand) ? ['-Command', command] : ['-lic', `exec ${command}`];
}

// The agent pane runs `claude` through the same shell the editor pane runs nvim through, and for the
// same reason spelled out above editorArguments: an app launched from the Dock inherits almost no
// PATH, and claude is installed wherever the user's shell manager put it. `exec` leaves claude as the
// pane's only process rather than parking a shell above it for as long as the work takes.
//
// PowerShell gets no `exec` — it has none — so the shell stays as claude's parent there.
export function agentArguments(shellCommand: string, prompt: string): string[] {
  const quoted = quoteForShell(prompt, shellCommand);
  return isPowerShell(shellCommand)
    ? ['-Command', `claude ${quoted}`]
    : ['-lic', `exec claude ${quoted}`];
}

// A command run across projects goes through the user's shell, login and interactive, for the same
// reason spelled out above editorArguments: an app launched from the Dock inherits almost no PATH, so
// `npm` is not found unless the shell's own startup files have run. `-l` is where Homebrew is and `-i`
// is where fnm, nvm, rbenv, pyenv and mise are, and a command needs both.
//
// No `exec`, unlike the panes. Nothing is taking this process over — the shell is the thing whose exit
// code a row prints, and it has to survive to report it.
//
// `-i` with no terminal attached is the one thing here that is new: a shell started interactive
// without a tty can complain about job control on stderr, and that complaint is then part of the
// output a row takes its last line from. If it turns out to be, the fix is to prefer the last line of
// stdout and fall back to stderr only when stdout is empty.
export function taskArguments(shellCommand: string, command: string): string[] {
  return isPowerShell(shellCommand) ? ['-Command', command] : ['-lic', command];
}

// Asking the shell where a program is. `command -v` is a POSIX builtin and PowerShell has no such
// thing — hand it one and it errors, so a Windows machine with nvim right there on the PATH is told
// nvim is not on its PATH. `Get-Command` is the PowerShell spelling, and `.Source` is the part of the
// object that is the path; without -ErrorAction it writes an error record instead of printing nothing.
export function locateCommand(shellCommand: string, program: string): string {
  return isPowerShell(shellCommand)
    ? `(Get-Command ${program} -ErrorAction SilentlyContinue).Source`
    : `command -v ${program}`;
}
