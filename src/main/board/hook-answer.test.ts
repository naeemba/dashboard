import { describe, expect, it } from 'vitest';
import { partsWithFolders, resolveWord } from './hook-answer';

// On Windows a folder a `cd` resolved carries a drive letter and backslashes.
const posix = (folder: string) => folder.replaceAll('\\', '/').replace(/^[A-Za-z]:/, '');
const folders = (command: string) => partsWithFolders(command, '/work/crm').map(({ part, folder, shell }) => [part, posix(folder), posix(shell)]);

describe('partsWithFolders', () => {
  it('ends a cd where the subshell holding it closes', () => {
    expect(folders('(cd storefront && pnpm i) && npm install')).toEqual([
      ['(cd storefront', '/work/crm', '/work/crm'],
      ['pnpm i)', '/work/crm/storefront', '/work/crm'],
      ['npm install', '/work/crm', '/work/crm'],
    ]);
  });

  it('moves the shell for a cd outside a subshell, and skips a cd flag', () => {
    expect(folders('cd -P storefront && npm install')[1]).toEqual(['npm install', '/work/crm/storefront', '/work/crm/storefront']);
  });
});

describe('resolveWord', () => {
  it('reads a Git Bash drive path on Windows, and leaves it a folder elsewhere', () => {
    expect(resolveWord('/c/work', 'D:\\x', 'win32')).toBe('C:\\work');
    expect(resolveWord('/c', 'D:\\x', 'win32')).toBe('C:\\');
    expect(resolveWord('/cd/work', 'D:\\x', 'win32')).toBe('D:\\cd\\work');
    expect(resolveWord('/c/work', '/x', 'linux')).toBe('/c/work');
  });
});
