import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginShellValue, pathFromShell } from './shell-path';

describe('pathFromShell', () => {
  it('takes the last line, past whatever the shell printed on start', () => {
    expect(pathFromShell('Welcome back\n/home/me/.nvm/bin:/usr/bin', '/usr/bin')).toBe('/home/me/.nvm/bin:/usr/bin');
  });
  it('keeps the app\'s own when the shell said nothing', () => expect(pathFromShell('', '/usr/bin')).toBe('/usr/bin'));
});

describe.skipIf(process.platform === 'win32')('loginShellValue', () => {
  const shell = process.env.SHELL;
  beforeEach(() => {
    process.env.SHELL = '/bin/sh';
    process.env.DASHBOARD_PROBE = '/tmp/own';
  });
  afterEach(() => {
    process.env.SHELL = shell;
    delete process.env.DASHBOARD_PROBE;
  });
  it('starts the shell with the environment given, not the app\'s', () => {
    expect(loginShellValue('DASHBOARD_PROBE', { ...process.env, DASHBOARD_PROBE: '/tmp/x' })).toBe('/tmp/x');
  });
  it('leaves an undefined entry out of the shell\'s environment', () => {
    expect(loginShellValue('DASHBOARD_PROBE', { ...process.env, DASHBOARD_PROBE: undefined })).toBeUndefined();
  });
});
