import { describe, expect, it } from 'vitest';
import { pickShell } from './shell';

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
