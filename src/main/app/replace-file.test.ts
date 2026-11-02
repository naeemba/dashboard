import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceFile } from './replace-file';

// Lets one test make the write itself fail the way a full disk does; every other test writes for real.
const writes = vi.hoisted(() => ({ failure: undefined as Error | undefined }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (...parameters: Parameters<typeof actual.writeFileSync>) => {
      if (writes.failure && typeof parameters[0] === 'number') throw writes.failure;
      return actual.writeFileSync(...parameters);
    },
  };
});

afterEach(() => { writes.failure = undefined; });

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

  it('removes its temporary file when the write itself fails', () => {
    const folder = mkdtempSync(join(tmpdir(), 'replace-file-'));
    const filePath = join(folder, 'board.json');
    writeFileSync(filePath, 'old');
    writes.failure = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    expect(() => replaceFile(filePath, 'new')).toThrow('no space left on device');
    expect(readdirSync(folder)).toEqual(['board.json']);
    expect(readFileSync(filePath, 'utf8')).toBe('old');
  });
});
