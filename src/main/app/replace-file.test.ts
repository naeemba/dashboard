import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replaceFile } from './replace-file';

describe('replaceFile', () => {
  it('replaces the file and leaves no temporary file behind once the rename lands', () => {
    const folder = mkdtempSync(join(tmpdir(), 'replace-file-'));
    const filePath = join(folder, 'board.json');
    writeFileSync(filePath, 'old');
    replaceFile(filePath, 'new');
    expect(readFileSync(filePath, 'utf8')).toBe('new');
    expect(readdirSync(folder)).toEqual(['board.json']);
  });

  it('removes its temporary file when the rename cannot land', () => {
    const folder = mkdtempSync(join(tmpdir(), 'replace-file-'));
    // A folder with something in it where the file goes: the rename fails, and must say so.
    mkdirSync(join(folder, 'board.json', 'inside'), { recursive: true });
    expect(() => replaceFile(join(folder, 'board.json'), 'new')).toThrow();
    expect(readdirSync(folder)).toEqual(['board.json']);
  });
});
