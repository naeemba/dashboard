import { describe, expect, it } from 'vitest';
import { agentArguments, editorArguments, pickShell, quoteForShell } from './shell';
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
    expect(editorArguments('/bin/zsh')).toEqual(['-lic', 'exec nvim']);
    expect(editorArguments('/opt/homebrew/bin/fish')).toEqual(['-lic', 'exec nvim']);
  });

  it('uses the PowerShell spelling for PowerShell', () => {
    expect(editorArguments('powershell.exe')).toEqual(['-Command', 'nvim']);
    expect(editorArguments('C:\\Program Files\\PowerShell\\pwsh.exe')).toEqual(['-Command', 'nvim']);
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
