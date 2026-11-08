import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileCandidates, firstFile, wholePath } from './file-open';
import { temporaryFolder } from '../testing/temporary-folder';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive, D:\work\api, so the paths these expect never come back.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

describe('fileCandidates', () => {
  posixPathsOnly('tries the live folder, then the starting folder, then the project, once each', () => {
    expect(fileCandidates('src/a.ts', ['/work/tree', undefined, '/project', '/project'], '/home/me'))
      .toEqual(['/work/tree/src/a.ts', '/project/src/a.ts']);
  });

  posixPathsOnly('reads ~/ as the home folder and an absolute path as itself', () => {
    expect(fileCandidates('~/.zshrc', ['/project'], '/home/me')).toEqual(['/home/me/.zshrc']);
    expect(fileCandidates('/etc/hosts', ['/project'], '/home/me')).toEqual(['/etc/hosts']);
  });

  posixPathsOnly('resolves ../ against each folder', () => {
    expect(fileCandidates('../b.ts', ['/project/src'], '/home/me')).toEqual(['/project/b.ts']);
  });
});

// What decides whether the pane's live folder is looked up at all: only when this answers nothing.
describe('wholePath', () => {
  posixPathsOnly('names the place for ~/ and an absolute path, and nothing for a relative one', () => {
    expect(wholePath('~', '/home/me')).toBe('/home/me');
    expect(wholePath('~/.zshrc', '/home/me')).toBe('/home/me/.zshrc');
    expect(wholePath('/etc/hosts', '/home/me')).toBe('/etc/hosts');
    expect(wholePath('src/a.ts', '/home/me')).toBeUndefined();
    expect(wholePath('../b.ts', '/home/me')).toBeUndefined();
  });

  // Each platform answers for itself, so each half runs only on its own platform.
  it.runIf(process.platform !== 'win32')('asks this platform: a drive letter is not whole on posix', () => {
    expect(wholePath('C:/code', '/home/me')).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('asks this platform: a drive letter is whole on windows', () => {
    expect(wholePath('C:/code', '/home/me')).toBe('C:/code');
  });
});

describe('firstFile', () => {
  const root = temporaryFolder('file-open-');
  mkdirSync(path.join(root, 'folder'));
  writeFileSync(path.join(root, 'file.ts'), '');

  // A folder of the same name earlier in the list is not the file.
  it('takes the first candidate that is a file, past a folder and a missing path', () => {
    const candidates = [path.join(root, 'missing.ts'), path.join(root, 'folder'), path.join(root, 'file.ts')];
    return expect(firstFile(candidates)).resolves.toBe(path.join(root, 'file.ts'));
  });

  it('answers nothing when no candidate is a file', () => (
    expect(firstFile([path.join(root, 'folder')])).resolves.toBeUndefined()
  ));
});
