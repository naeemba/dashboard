import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// conventions-rule-2: every <input> and <textarea> gets dir = 'auto' in the change that adds it, or a
// Persian title typed into it runs away from the caret. Counted by lines, per file, so a box added in
// one file cannot hide behind a spare dir = 'auto' in another.
const CREATES_BOX = /createElement\(['"](input|textarea)['"]\)/;
const SETS_DIRECTION = /\.dir = ['"]auto['"]/;

function countsByFile(pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of readdirSync('src', { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const lines = readFileSync(path.join('src', file), 'utf8').split('\n');
    const count = lines.filter((line) => pattern.test(line)).length;
    if (count > 0) counts[file.split(path.sep).join('/')] = count;
  }
  return counts;
}

describe('text boxes', () => {
  it('set dir = auto once for every input or textarea they create, file by file', () => {
    expect(countsByFile(SETS_DIRECTION)).toEqual(countsByFile(CREATES_BOX));
  });

  it('finds the boxes the app has, so an empty scan cannot pass', () => {
    expect(Object.keys(countsByFile(CREATES_BOX))).not.toHaveLength(0);
  });
});
