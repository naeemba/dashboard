import { describe, expect, it } from 'vitest';
import { pickShell, quoteForShell } from './shell';

describe('pickShell', () => {
  it('prefers SHELL_COMMAND', () => {
    expect(pickShell({ SHELL_COMMAND: '/opt/fish', SHELL: '/bin/zsh' }, 'darwin')).toBe('/opt/fish');
  });

  it('falls back to SHELL', () => {
    expect(pickShell({ SHELL: '/bin/zsh' }, 'linux')).toBe('/bin/zsh');
  });

  it('falls back per platform', () => {
    expect(pickShell({}, 'darwin')).toBe('/bin/zsh');
    expect(pickShell({}, 'linux')).toBe('/bin/bash');
    expect(pickShell({}, 'win32')).toBe('powershell.exe');
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
