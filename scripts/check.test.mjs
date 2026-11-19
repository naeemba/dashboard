import { describe, expect, it } from 'vitest';
import { summaryLine } from './check.mjs';

describe('summaryLine', () => {
  it("reads vitest's Tests line, not the worker lines after it", () => {
    const output = ' Test Files  1 failed | 316 passed (317)\n      Tests  2 failed | 3550 passed (3552)\n'
      + '    Isolate  317 workers spawned\n';
    expect(summaryLine('test', output, false)).toBe('test       FAIL  2 failed | 3550 passed (3552)');
  });

  it('says so when vitest never got to its counts', () => {
    expect(summaryLine('test', 'Error: config failed to load', false)).toBe('test       FAIL  no test count');
  });

  it("counts tsc's errors, colours and all", () => {
    const output = "\u001b[96msrc/a.ts\u001b[0m(1,7): \u001b[91merror\u001b[0m TS2322: Type 'string'\n"
      + 'src/b.ts(2,1): error TS2304: Cannot find name\n';
    expect(summaryLine('typecheck', output, false)).toBe('typecheck  FAIL  2 errors');
    expect(summaryLine('typecheck', '', true)).toBe('typecheck  pass  0 errors');
  });

  it("adds eslint's problems to the markdown check's", () => {
    const output = '✖ 1 problem (1 error, 0 warnings)\n✖ 3 problems (markdown lines over 100 columns)\n';
    expect(summaryLine('lint', output, false)).toBe('lint       FAIL  4 problems');
    expect(summaryLine('lint', '', true)).toBe('lint       pass  0 problems');
  });

  it('says so when tsc or eslint failed before counting anything', () => {
    const output = "Error: Cannot find module 'eslint/bin/eslint.js'\n";
    expect(summaryLine('typecheck', output, false)).toBe('typecheck  FAIL  no error count');
    expect(summaryLine('lint', output, false)).toBe('lint       FAIL  no problem count');
  });
});
