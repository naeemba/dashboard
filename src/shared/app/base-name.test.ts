import { describe, expect, it } from 'vitest';
import { baseName } from './base-name';

describe('baseName', () => {
  it('takes the last segment of a POSIX path', () => {
    expect(baseName('/Users/sharp/work/api')).toBe('api');
  });

  // node:path on darwin hands this one back whole, which is the reason this exists.
  it('splits on a backslash too, whatever platform is asking', () => {
    expect(baseName('C:\\Users\\sharp\\work\\api')).toBe('api');
    expect(baseName('powershell.exe')).toBe('powershell.exe');
  });

  it('ignores a trailing separator rather than answering nothing', () => {
    expect(baseName('/Users/sharp/work/api/')).toBe('api');
  });

  it('hands back a path with no segment in it, so something is always shown', () => {
    expect(baseName('/')).toBe('/');
    expect(baseName('')).toBe('');
  });
});
