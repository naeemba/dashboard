import { describe, expect, it } from 'vitest';
import { agentArguments, editorArguments, locateCommand, pickShell, quoteForShell, taskArguments } from './shell';
import { defaultSettings } from './settings';

describe('pickShell', () => {
  it('prefers SHELL_COMMAND', () => {
    expect(pickShell(defaultSettings(true), { SHELL_COMMAND: '/opt/fish', SHELL: '/bin/zsh' }, 'darwin'))
      .toBe('/opt/fish');
  });

  it('falls back to SHELL', () => {
    expect(pickShell(defaultSettings(true), { SHELL: '/bin/zsh' }, 'linux')).toBe('/bin/zsh');
  });

  it('falls back per platform', () => {
    expect(pickShell(defaultSettings(true), {}, 'darwin')).toBe('/bin/zsh');
    expect(pickShell(defaultSettings(true), {}, 'linux')).toBe('/bin/bash');
    expect(pickShell(defaultSettings(true), {}, 'win32')).toBe('powershell.exe');
  });

  it('lets the settings file beat both environment variables', () => {
    const settings = { ...defaultSettings(true), shellCommand: '/opt/homebrew/bin/fish' };
    expect(pickShell(settings, { SHELL_COMMAND: '/bin/zsh', SHELL: '/bin/bash' }, 'darwin'))
      .toBe('/opt/homebrew/bin/fish');
  });
});

describe('quoteForShell', () => {
  it('leaves an ordinary path alone', () => {
    expect(quoteForShell('/Users/sharp/notes.md', '/bin/zsh')).toBe('/Users/sharp/notes.md');
  });

  it('quotes a path with a space', () => {
    expect(quoteForShell('/Users/sharp/my notes.md', '/bin/zsh')).toBe("'/Users/sharp/my notes.md'");
  });

  it('quotes characters the shell would expand', () => {
    expect(quoteForShell('/tmp/$HOME `x` *', '/bin/bash')).toBe("'/tmp/$HOME `x` *'");
  });

  it('closes, escapes and reopens around a single quote', () => {
    expect(quoteForShell("/tmp/it's here", '/bin/zsh')).toBe("'/tmp/it'\\''s here'");
  });

  it('doubles a single quote for PowerShell', () => {
    expect(quoteForShell("C:\\Users\\me\\it's here", 'powershell.exe')).toBe("'C:\\Users\\me\\it''s here'");
    expect(quoteForShell("/tmp/it's here", '/opt/homebrew/bin/pwsh')).toBe("'/tmp/it''s here'");
  });

  it('follows the overridden shell, not the platform it runs on', () => {
    expect(quoteForShell("C:\\Users\\me\\John's notes.pdf", 'C:\\Program Files\\Git\\bin\\bash.exe'))
      .toBe("'C:\\Users\\me\\John'\\''s notes.pdf'");
  });

  it('quotes the POSIX way when the shell is unknown', () => {
    expect(quoteForShell("/tmp/it's here", '')).toBe("'/tmp/it'\\''s here'");
  });
});

describe('editorArguments', () => {
  // Login and interactive both: -l is where a Mac PATH picks up Homebrew, -i is where it picks up the
  // version managers the terminal panes already have. Spawn nvim directly and the pane dies with an exit
  // code instead of opening an editor; drop -i and its language servers cannot find node.
  it('runs nvim through a login interactive POSIX shell', () => {
    expect(editorArguments('/bin/zsh', '/tmp/one.sock')).toEqual(['-lic', 'exec nvim --listen /tmp/one.sock']);
    expect(editorArguments('/opt/homebrew/bin/fish', '/tmp/one.sock')).toEqual(['-lic', 'exec nvim --listen /tmp/one.sock']);
  });

  it('uses the PowerShell spelling for PowerShell', () => {
    expect(editorArguments('powershell.exe', '/tmp/one.sock')).toEqual(['-Command', 'nvim --listen /tmp/one.sock']);
    expect(editorArguments('C:\\Program Files\\PowerShell\\pwsh.exe', '/tmp/one.sock')).toEqual(['-Command', 'nvim --listen /tmp/one.sock']);
  });

  // The socket sits wherever the operating system puts this app's temp folder, and that path is not
  // ours to promise anything about — a space in it is allowed. Unquoted, nvim is told to listen on the
  // half before the space and the pane dies on the rest. Both shells, because each reads the other's
  // quoting as garbage and SHELL_COMMAND lets a Mac run pwsh.
  it('quotes a socket path with a space in it, in either shell', () => {
    expect(editorArguments('/bin/zsh', '/tmp/my sockets/one.sock'))
      .toEqual(['-lic', "exec nvim --listen '/tmp/my sockets/one.sock'"]);
    expect(editorArguments('powershell.exe', 'C:\\Users\\My Name\\Temp\\one.sock'))
      .toEqual(['-Command', "nvim --listen 'C:\\Users\\My Name\\Temp\\one.sock'"]);
  });
});

describe('locateCommand', () => {
  it('asks a POSIX shell with its own builtin', () => {
    expect(locateCommand('/bin/zsh', 'nvim')).toBe('command -v nvim');
  });

  // PowerShell has no `command`. Handed one it errors, the lookup comes back empty, and a Windows
  // machine with nvim on its PATH is told nvim is not on its PATH.
  it('asks PowerShell in the only spelling it has', () => {
    expect(locateCommand('powershell.exe', 'nvim'))
      .toBe('(Get-Command nvim -ErrorAction SilentlyContinue).Source');
  });
});

describe('agentArguments', () => {
  // A prompt with a space in it — every real one, since a slash command is followed by an argument —
  // goes through quoteForShell like any other word with a space, which is why it comes back quoted.
  it('runs claude through a login and interactive shell, as nvim does', () => {
    expect(agentArguments('/bin/zsh', '/work-card fc2bf7b0'))
      .toEqual(['-lic', "exec claude '/work-card fc2bf7b0'"]);
  });

  // The prompt reaches the shell as a word. A card id is plain, but the quoting is what stops a
  // prompt from ever being read as syntax.
  it('quotes a prompt with a space or a quote in it', () => {
    expect(agentArguments('/bin/zsh', "/work-card it's here"))
      .toEqual(['-lic', "exec claude '/work-card it'\\''s here'"]);
  });

  it('uses PowerShell quoting when PowerShell will receive it', () => {
    expect(agentArguments('powershell.exe', "/work-card it's here"))
      .toEqual(['-Command', "claude '/work-card it''s here'"]);
  });
});

describe('taskArguments', () => {
  // No `exec`: the shell stays as the process, so the exit code the row prints is the shell's own.
  it('runs the command through a login, interactive POSIX shell', () => {
    expect(taskArguments('/bin/zsh', 'npm audit')).toEqual(['-lic', 'npm audit']);
  });

  it('uses PowerShell’s own flag where that is the shell', () => {
    expect(taskArguments('pwsh', 'npm audit')).toEqual(['-Command', 'npm audit']);
  });
});
