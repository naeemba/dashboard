import { describe, expect, it } from 'vitest';
import { coverageLines, coveredFile } from './coverage.mjs';

const counts = (covered, total) => ({ covered, total, skipped: 0, pct: 0 });
const file = (lines, branches) => ({ lines, branches, statements: lines, functions: counts(1, 1) });

describe('coveredFile', () => {
  it('takes the code under src/ and scripts/, never a test, a declaration or a doc', () => {
    expect(['src/main/a.ts', 'scripts/check.mjs', 'src/a.test.ts', 'scripts/check.test.mjs', 'src/env.d.ts',
      'docs/a.md', 'vitest.config.ts'].filter(coveredFile)).toEqual(['src/main/a.ts', 'scripts/check.mjs']);
  });
});

describe('coverageLines', () => {
  it('lists each changed file a test leaves partly unrun, and one no test runs', () => {
    const summary = {
      total: file(counts(9, 20), counts(4, 8)),
      '/repo/src/full.ts': file(counts(5, 5), counts(2, 2)),
      '/repo/src/partly.ts': file(counts(4, 5), counts(2, 4)),
      '/repo/src/view.ts': file(counts(0, 10), counts(0, 2)),
    };
    expect(coverageLines(summary, '/repo')).toEqual([
      'coverage   3 changed files, 2 not fully tested',
      'src/partly.ts  2 of 4 branches, 4 of 5 lines',
      'src/view.ts  no test runs it',
    ]);
  });
});
