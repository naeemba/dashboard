import { describe, expect, it } from 'vitest';
import { runningFromRepository } from './running-app.mjs';

describe('runningFromRepository', () => {
  it('takes a POSIX app running out of the checkout', () => {
    const line = '/home/me/dashboard/node_modules/electron/dist/electron .';
    expect(runningFromRepository([line, 'zsh'], '/home/me/dashboard', 'linux')).toEqual([line]);
  });

  it('takes a Windows app with backslashes and a lower-case drive', () => {
    const line = 'c:\\users\\me\\dashboard\\out\\Dashboard-win32-x64\\Dashboard.exe';
    expect(runningFromRepository([line], 'C:\\Users\\me\\dashboard', 'win32')).toEqual([line]);
  });

  it('folds case only on Windows', () => {
    expect(runningFromRepository(['/home/Me/dashboard/out/app'], '/home/me/dashboard', 'linux')).toEqual([]);
  });

  it('leaves an app from another checkout alone', () => {
    const lines = ['/home/me/dashboard-other/out/app', '/home/me/other/dashboard/.vite/build/main.js'];
    expect(runningFromRepository(lines, '/home/me/dashboard', 'linux')).toEqual([]);
  });

  it('leaves a process in the checkout that is not the app alone', () => {
    expect(runningFromRepository(['nvim /home/me/dashboard/src/main.ts'], '/home/me/dashboard', 'linux')).toEqual([]);
  });
});
