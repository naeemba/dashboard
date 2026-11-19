import { describe, expect, it } from 'vitest';
import { pathFromShell } from './shell-path';

describe('pathFromShell', () => {
  it('takes the last line, past whatever the shell printed on start', () => {
    expect(pathFromShell('Welcome back\n/home/me/.nvm/bin:/usr/bin', '/usr/bin')).toBe('/home/me/.nvm/bin:/usr/bin');
  });
  it('keeps the app\'s own when the shell said nothing', () => expect(pathFromShell('', '/usr/bin')).toBe('/usr/bin'));
});
