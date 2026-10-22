import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileCandidates, firstFile } from './file-open';

describe('fileCandidates', () => {
  it('tries the live folder, then the starting folder, then the project, once each', () => {
    expect(fileCandidates('src/a.ts', ['/work/tree', undefined, '/project', '/project'], '/home/me'))
      .toEqual(['/work/tree/src/a.ts', '/project/src/a.ts']);
  });

  it('reads ~/ as the home folder and an absolute path as itself', () => {
    expect(fileCandidates('~/.zshrc', ['/project'], '/home/me')).toEqual(['/home/me/.zshrc']);
    expect(fileCandidates('/etc/hosts', ['/project'], '/home/me')).toEqual(['/etc/hosts']);
  });

  it('resolves ../ against each folder', () => {
    expect(fileCandidates('../b.ts', ['/project/src'], '/home/me')).toEqual(['/project/b.ts']);
  });
});

describe('firstFile', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'file-open-'));
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
