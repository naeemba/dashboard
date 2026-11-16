import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStringRecord } from './string-record-file';
import { temporaryFolder } from '../testing/temporary-folder';

describe('readStringRecord', () => {
  const folder = temporaryFolder('string-record-file-');
  const file = (name: string, text: string): string => {
    const at = path.join(folder, name);
    writeFileSync(at, text);
    return at;
  };

  it('reads each string kept by path', () => {
    expect(readStringRecord(file('good.json', '{"/a": "id-1"}'))).toEqual({ '/a': 'id-1' });
  });

  it('leaves out anything that is not a string', () => {
    expect(readStringRecord(file('mixed.json', '{"/a": "id-1", "/b": 3}'))).toEqual({ '/a': 'id-1' });
  });

  it('reads a missing or broken file as nothing remembered', () => {
    expect(readStringRecord(path.join(folder, 'missing.json'))).toEqual({});
    expect(readStringRecord(file('broken.json', '{'))).toEqual({});
    expect(readStringRecord(file('list.json', '["id"]'))).toEqual({});
  });
});
