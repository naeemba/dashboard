import { describe, expect, it } from 'vitest';
import { BASE_REFS, coverageLines, coveredFile, mergeBase } from './coverage.mjs';

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
    expect(coverageLines(summary, ['src/full.ts', 'src/partly.ts', 'src/view.ts'], '/repo')).toEqual([
      'coverage   3 changed files, 2 not fully tested',
      'src/partly.ts  2 of 4 branches, 4 of 5 lines',
      'src/view.ts  no test runs it',
    ]);
  });

  it('says when no code changed, before looking for a report', () => {
    expect(coverageLines(undefined, [], '/repo')).toEqual(['coverage   no code changed against main']);
  });

  it('says when vitest wrote no report for code that changed', () => {
    expect(coverageLines(undefined, ['src/a.ts'], '/repo')).toEqual(['coverage   no report: vitest wrote none']);
  });
});

describe('mergeBase', () => {
  it("takes origin's main before the local one, and nothing when neither has a base", () => {
    expect(BASE_REFS).toEqual(['origin/main', 'main']);
    expect(mergeBase([{ status: 0, stdout: 'abc\n' }, { status: 0, stdout: 'old\n' }])).toBe('abc');
    expect(mergeBase([{ status: 128, stdout: '' }, { status: 0, stdout: 'old\n' }])).toBe('old');
    expect(mergeBase([{ status: 128, stdout: '' }, { status: 128, stdout: '' }])).toBeUndefined();
  });
});
