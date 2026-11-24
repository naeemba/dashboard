import { describe, expect, it } from 'vitest';
import { capped, reasonLines, summaryLine } from './check.mjs';

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

  it('says eslint died even when the markdown check counted problems', () => {
    const output = 'Error: config threw\neslint failed\n✖ 3 problems (markdown lines over 100 columns)\n';
    expect(summaryLine('lint', output, false)).toBe('lint       FAIL  no eslint count, 3 markdown problems');
    const counted = '✖ 1 problem (1 error, 0 warnings)\neslint failed\n✖ 3 problems (markdown lines)\n';
    expect(summaryLine('lint', counted, false)).toBe('lint       FAIL  4 problems');
  });
});

describe('reasonLines', () => {
  it("names each failed test with the error under it, not vitest's separator", () => {
    const output = '⎯⎯⎯ Failed Tests 2 ⎯⎯⎯\n\n FAIL  src/a.test.ts > outer > adds\n'
      + 'AssertionError: expected 1 to be 2 // Object.is equality\n\n FAIL  src/b.test.ts [ src/b.test.ts ]\n'
      + '⎯⎯⎯[1/2]⎯\n      Tests  1 failed | 3 passed (4)\n';
    expect(reasonLines('test', output)).toEqual([
      'src/a.test.ts > outer > adds: AssertionError: expected 1 to be 2 // Object.is equality',
      'src/b.test.ts [ src/b.test.ts ]',
    ]);
  });

  it('gives each test of a group vitest prints one shared error under that error', () => {
    expect(reasonLines('test', ' FAIL  a > one\n FAIL  a > two\nError: setup broke\n')).toEqual([
      'a > one: Error: setup broke',
      'a > two: Error: setup broke',
    ]);
  });

  it("keeps tsc's error lines, colours stripped", () => {
    const output = "\u001b[96msrc/a.ts\u001b[0m(1,7): \u001b[91merror\u001b[0m TS2322: Type 'string'\n  more detail\n";
    expect(reasonLines('typecheck', output)).toEqual(["src/a.ts(1,7): error TS2322: Type 'string'"]);
  });

  it("puts eslint's file in front of each problem, then the long markdown lines", () => {
    const output = "/repo/src/a.ts\n  1:7  error  'x' is assigned a value but never used       no-unused-vars\n"
      + '\n✖ 1 problem (1 error, 0 warnings)\ndocs/a.md:3  120 columns, over 100\n';
    expect(reasonLines('lint', output, '/repo')).toEqual([
      "src/a.ts:1:7  error  'x' is assigned a value but never used  no-unused-vars",
      'docs/a.md:3  120 columns, over 100',
    ]);
  });

  it('prints the error lines of a check that died before saying what failed', () => {
    expect(reasonLines('test', 'Error: config failed to load\n    at x.js:1\n')).toEqual(['Error: config failed to load']);
    const lint = "Error: Cannot find module 'x'\neslint failed\ndocs/a.md:3  120 columns, over 100\n";
    expect(reasonLines('lint', lint)).toEqual(["Error: Cannot find module 'x'", 'docs/a.md:3  120 columns, over 100']);
  });
});

describe('capped', () => {
  it('shows five, indented, and says the rest are in the log', () => {
    const lines = ['1', '2', '3', '4', '5', '6', '7'];
    const indented = (list) => list.map((line) => `    ${line}`);
    expect(capped(lines.slice(0, 5))).toEqual(indented(['1', '2', '3', '4', '5']));
    expect(capped(lines)).toEqual(indented(['1', '2', '3', '4', '5', '… 2 more in check.log']));
  });
});
