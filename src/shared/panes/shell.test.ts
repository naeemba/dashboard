import { describe, expect, it } from 'vitest';
import { agentArguments, agentResumeArguments, droppedPathsText, editorArguments, locateCommand, pickShell, quoteForShell, taskArguments, windowsPowerShellWraps } from './shell';
import { defaultSettings } from '../settings/settings';

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

describe('droppedPathsText', () => {
  it('quotes each path and ends with a space', () => {
    expect(droppedPathsText(['/a.md', '/my notes.md'], '/bin/zsh')).toBe("/a.md '/my notes.md' ");
  });

  it('skips a file with no path on disk', () => {
    expect(droppedPathsText(['', '/a.md'], '/bin/zsh')).toBe('/a.md ');
  });

  it('types nothing when no dropped file has a path', () => {
    expect(droppedPathsText([''], '/bin/zsh')).toBe('');
    expect(droppedPathsText([], '/bin/zsh')).toBe('');
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
  // version managers the terminal panes already have.
  //
  // The `-c` is what makes the pane say which file is open: nvim's 'title' is off by default, so without
  // it the pane reads a bare `nvim` whatever is loaded. titlestring with it, because nvim's own default
  // title is the filename, the folder and a trailing "Nvim" — three times the width the status bar has.
  //
  // Spawn nvim directly and the pane dies with an exit code instead of opening an editor; drop -i and
  // its language servers cannot find node.
  it('runs nvim through a login interactive POSIX shell', () => {
    expect(editorArguments('/bin/zsh', '/tmp/one.sock'))
      .toEqual(['-lic', "exec nvim --listen /tmp/one.sock -c 'set title titlestring=%t'"]);
    expect(editorArguments('/opt/homebrew/bin/fish', '/tmp/one.sock'))
      .toEqual(['-lic', "exec nvim --listen /tmp/one.sock -c 'set title titlestring=%t'"]);
  });

  it('uses the PowerShell spelling for PowerShell', () => {
    expect(editorArguments('powershell.exe', '/tmp/one.sock'))
      .toEqual(['-Command', "nvim --listen /tmp/one.sock -c 'set title titlestring=%t'"]);
    expect(editorArguments('C:\\Program Files\\PowerShell\\pwsh.exe', '/tmp/one.sock'))
      .toEqual(['-Command', "nvim --listen /tmp/one.sock -c 'set title titlestring=%t'"]);
  });

  // The socket sits wherever the operating system puts this app's temp folder, and that path is not
  // ours to promise anything about — a space in it is allowed. Unquoted, nvim is told to listen on the
  // half before the space and the pane dies on the rest. Both shells, because each reads the other's
  // quoting as garbage and SHELL_COMMAND lets a Mac run pwsh.
  it('quotes a socket path with a space in it, in either shell', () => {
    expect(editorArguments('/bin/zsh', '/tmp/my sockets/one.sock'))
      .toEqual(['-lic', "exec nvim --listen '/tmp/my sockets/one.sock' -c 'set title titlestring=%t'"]);
    expect(editorArguments('powershell.exe', 'C:\\Users\\My Name\\Temp\\one.sock'))
      .toEqual(['-Command', "nvim --listen 'C:\\Users\\My Name\\Temp\\one.sock' -c 'set title titlestring=%t'"]);
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

describe('agentResumeArguments', () => {
  it('resumes a session the way a ship starts one, as the pane\'s only process', () => {
    expect(agentResumeArguments('/bin/zsh', 'ccaaf965-c864-48db-8044-30bf27d93087'))
      .toEqual(['-lic', 'exec claude --resume ccaaf965-c864-48db-8044-30bf27d93087']);
  });

  it('leaves PowerShell without exec, which it does not have', () => {
    expect(agentResumeArguments('pwsh', 'ccaaf965-c864-48db-8044-30bf27d93087'))
      .toEqual(['-Command', 'claude --resume ccaaf965-c864-48db-8044-30bf27d93087']);
  });
});

describe('agentArguments', () => {
  const SESSION = 'ccaaf965-c864-48db-8044-30bf27d93087';
  // A prompt with a space in it — every real one, since a slash command is followed by an argument —
  // goes through quoteForShell like any other word with a space, which is why it comes back quoted.
  it('runs claude through a login and interactive shell, as nvim does', () => {
    expect(agentArguments('/bin/zsh', '/work-card fc2bf7b0', SESSION))
      .toEqual(['-lic', `exec claude --session-id ${SESSION} '/work-card fc2bf7b0'`]);
  });

  // The prompt reaches the shell as a word. A card id is plain, but the quoting is what stops a
  // prompt from ever being read as syntax.
  it('quotes a prompt with a space or a quote in it', () => {
    expect(agentArguments('/bin/zsh', "/work-card it's here", SESSION))
      .toEqual(['-lic', `exec claude --session-id ${SESSION} '/work-card it'\\''s here'`]);
  });

  it('uses PowerShell quoting when PowerShell will receive it', () => {
    expect(agentArguments('powershell.exe', "/work-card it's here", SESSION))
      .toEqual(['-Command', `claude --session-id ${SESSION} '/work-card it''s here'`]);
  });

  // Windows PowerShell writes a double quote inside a word through to the program bare, and the program
  // splits the word there and drops the quote: a worker's --settings JSON arrived with none of its
  // quotes and Claude refused to start. The backslash is what makes Windows read the quote as a quote.
  it('escapes a double quote for the program when Windows PowerShell will pass it on', () => {
    expect(agentArguments('powershell.exe', 'fix the "login" bug', SESSION))
      .toEqual(['-Command', `claude --session-id ${SESSION} 'fix the \\"login\\" bug'`]);
    expect(agentArguments('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '{"a":1}', SESSION)[1])
      .toContain(`'{\\"a\\":1}'`);
  });

  // Backslashes are plain characters to Windows unless a quote follows them. Before a quote they escape
  // it, so the ones already there are doubled; at the end of a word with a space in it PowerShell adds
  // the closing quote, so those are doubled too.
  it('keeps backslashes the program would otherwise read as escapes', () => {
    expect(agentArguments('powershell.exe', 'say \\"hi', SESSION)[1]).toContain(`'say \\\\\\"hi'`);
    expect(agentArguments('powershell.exe', 'look in C:\\work\\', SESSION)[1]).toContain(`'look in C:\\work\\\\'`);
    expect(agentArguments('powershell.exe', 'C:\\work\\', SESSION)[1]).toContain(`'C:\\work\\'`);
  });

  // The escape holds only inside the quotes PowerShell adds, and it adds none to a word whose spaces are
  // all between quotes. A leading space is whitespace before any quote, which it always wraps.
  it('starts a word Windows PowerShell would not wrap with a space, so it does', () => {
    expect(agentArguments('powershell.exe', '"only quoted words"', SESSION)[1])
      .toContain(`' \\"only quoted words\\"'`);
  });

  // pwsh 7.3 and later escape the quotes themselves; a second escape would reach claude as a backslash.
  it('leaves the escaping to pwsh, which does its own', () => {
    expect(agentArguments('pwsh', 'fix the "login" bug', SESSION))
      .toEqual(['-Command', `claude --session-id ${SESSION} 'fix the "login" bug'`]);
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

describe('windowsPowerShellWraps', () => {
  // Windows PowerShell wraps a word for a program when it finds whitespace outside quotes, counting
  // every double quote and taking no notice of a backslash before one.
  it('wraps a word with a space outside quotes', () => {
    expect(windowsPowerShellWraps('fix the bug')).toBe(true);
    expect(windowsPowerShellWraps('fix the \\"login\\" bug')).toBe(true);
  });

  it('does not wrap a word whose spaces are all between quotes, or one with no space', () => {
    expect(windowsPowerShellWraps('{"command":"node notify done"}')).toBe(false);
    expect(windowsPowerShellWraps('\\"odd count and spaces after')).toBe(false);
    expect(windowsPowerShellWraps('C:\\work')).toBe(false);
  });
});
