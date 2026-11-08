import { statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearSocketPointer, readSocketPointer, SOCKET_POINTER_FILE, userDataFolder, writeSocketPointer } from './app-address';
import { temporaryFolder } from '../testing/temporary-folder';

describe('userDataFolder', () => {
  it('is the folder a pane names, when it names one', () => {
    expect(userDataFolder('linux', { DASHBOARD_USER_DATA: '/demo/data' }, '/home/ann')).toBe('/demo/data');
  });

  // Electron's appData joined with the product name, per platform. Joined with this machine's separator,
  // as the code joins it, so the test reads the same on Windows.
  it('is Electron\'s userData folder for Dashboard otherwise', () => {
    expect(userDataFolder('linux', {}, '/home/ann')).toBe(path.join('/home/ann', '.config', 'Dashboard'));
    expect(userDataFolder('linux', { XDG_CONFIG_HOME: '/home/ann/conf' }, '/home/ann')).toBe(path.join('/home/ann/conf', 'Dashboard'));
    expect(userDataFolder('darwin', {}, '/Users/ann')).toBe(path.join('/Users/ann', 'Library', 'Application Support', 'Dashboard'));
    expect(userDataFolder('win32', { APPDATA: 'C:\\Users\\ann\\AppData\\Roaming' }, 'C:\\Users\\ann'))
      .toBe(path.join('C:\\Users\\ann\\AppData\\Roaming', 'Dashboard'));
  });
});

describe('the socket pointer', () => {
  const folder = () => temporaryFolder('pointer-test-');

  it('reads back what was written, only this user may read it, and a missing file is no app', () => {
    const userData = folder();
    expect(readSocketPointer(userData)).toBeNull();
    writeSocketPointer(userData, '/tmp/dashboard-x/session.sock');
    expect(readSocketPointer(userData)).toBe('/tmp/dashboard-x/session.sock');
    if (process.platform !== 'win32') expect(statSync(path.join(userData, SOCKET_POINTER_FILE)).mode & 0o777).toBe(0o600);
  });

  it('is removed at quit only while it still names this app\'s socket', () => {
    const userData = folder();
    writeSocketPointer(userData, '/tmp/b/session.sock');
    clearSocketPointer(userData, '/tmp/a/session.sock');
    expect(readSocketPointer(userData)).toBe('/tmp/b/session.sock');
    clearSocketPointer(userData, '/tmp/b/session.sock');
    expect(readSocketPointer(userData)).toBeNull();
  });
});
