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
    expect(quoteForShell('/Users/sharp/notes.md', 'darwin')).toBe('/Users/sharp/notes.md');
  });

  it('quotes a path with a space', () => {
    expect(quoteForShell('/Users/sharp/my notes.md', 'darwin')).toBe("'/Users/sharp/my notes.md'");
  });

  it('quotes characters the shell would expand', () => {
    expect(quoteForShell('/tmp/$HOME `x` *', 'linux')).toBe("'/tmp/$HOME `x` *'");
  });

  it('closes, escapes and reopens around a single quote', () => {
    expect(quoteForShell("/tmp/it's here", 'darwin')).toBe("'/tmp/it'\\''s here'");
  });

  it('doubles a single quote for PowerShell', () => {
    expect(quoteForShell("C:/it's here", 'win32')).toBe("'C:/it''s here'");
  });
});
