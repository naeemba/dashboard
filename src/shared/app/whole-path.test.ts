import { describe, expect, it } from 'vitest';
import { isWholePath } from './whole-path';

describe('isWholePath', () => {
  it('takes the home folder, an absolute path and a drive letter', () => {
    for (const text of ['~', '~/code', '/etc', 'C:\\code\\api', 'c:/code']) expect(isWholePath(text)).toBe(true);
  });

  it('refuses a relative path and a name starting with a tilde', () => {
    for (const text of ['src/a.ts', '../b', '~api', 'C:code', '']) expect(isWholePath(text)).toBe(false);
  });
});
