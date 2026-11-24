// What `pnpm check` prints: one line a check, saying whether it passed and its counts, read from the
// check's own output. The entry is scripts/check-step.mjs, which keeps the full output in a log file.
import { relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

// A file's path from the checkout's top, with / between its folders on Windows too, as git and the
// docs write it.
export const relativePath = (root, file) => relative(root, file).replaceAll('\\', '/');

export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// A failed check that printed none of what is counted died before it ran (a missing module, a broken
// config), so it says so rather than `FAIL  0 errors`.
const counted = (count, noun, passed) => (count === 0 && !passed ? `no ${noun} count` : plural(count, noun));

// The counts in a check's output. Vitest says them on its `Tests` line; tsc's errors are one
// `error TS` line each; eslint and scripts/markdown-width-step.mjs each end on a `✖ N problems` line,
// the markdown one followed by `(markdown`. scripts/lint-step.mjs prints ESLINT_FAILED when eslint
// failed, so an eslint that died without its count is named even when the markdown half counted some.
export const ESLINT_FAILED = 'eslint failed';

const COUNTS = {
  test: (output) => output.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? 'no test count',
  typecheck: (output, passed) => counted(output.match(/error TS\d+:/g)?.length ?? 0, 'error', passed),
  lint: (output, passed) => {
    const sum = (markdown) => [...output.matchAll(/✖ (\d+) problems?( \(markdown)?/g)]
      .filter((match) => Boolean(match[2]) === markdown)
      .reduce((total, match) => total + Number(match[1]), 0);
    const eslint = sum(false);
    const markdown = sum(true);
    if (eslint === 0 && new RegExp(`^${ESLINT_FAILED}$`, 'm').test(output)) {
      return `no eslint count, ${plural(markdown, 'markdown problem')}`;
    }
    return counted(eslint + markdown, 'problem', passed);
  },
};

export const CHECKS = Object.keys(COUNTS);

// A check's name in the summary's first column.
export const label = (name) => `${name.padEnd(9)}  `;

export function summaryLine(check, output, passed) {
  return `${label(check)}${passed ? 'pass' : 'FAIL'}  ${COUNTS[check](stripVTControlCharacters(output), passed)}`;
}

// Why a check failed, printed under its FAIL line so nobody opens check.log to find out: vitest's
// `FAIL  file > test` lines with the error under each, tsc's `error TS` lines, eslint's problems as
// `file:line:column` and the markdown check's long lines. A check that died before any of those
// prints its error lines instead (`TypeError`, `[PARSE_ERROR]` too), less stack frames and banners.
const errorLines = (lines) => lines.filter((line) => /error\b/i.test(line) && !/^\s*(at\s|⎯)/.test(line))
  .map((line) => line.trim());

const REASONS = {
  test: (lines) => lines.flatMap((line, index) => {
    const name = line.match(/^\s*FAIL\s+(.+)$/)?.[1];
    if (!name) return [];
    let next = index + 1;
    // Vitest prints one error under all the FAIL lines whose errors are identical, so it skips them too.
    while (next < lines.length && (lines[next].trim() === '' || /^\s*FAIL\s/.test(lines[next]))) next += 1;
    const error = lines[next]?.trim();
    return [error && !error.startsWith('⎯') ? `${name}: ${error}` : name];
  }),
  typecheck: (lines) => lines.filter((line) => /error TS\d+:/.test(line)),
  lint: (lines, root) => {
    let file = '';
    const eslint = lines.flatMap((line) => {
      const problem = line.match(/^\s+(\d+:\d+)\s+(.+)$/);
      if (!problem) {
        if (/^[^\s✖]/.test(line)) file = line.trim();
        return [];
      }
      return [`${relativePath(root, file)}:${problem[1]}  ${problem[2].replace(/\s{2,}/g, '  ')}`];
    });
    const markdown = lines.filter((line) => /^\S+:\d+ {2}\d+ columns/.test(line));
    const died = eslint.length === 0 && lines.includes(ESLINT_FAILED);
    return [...(died ? errorLines(lines) : eslint), ...markdown];
  },
};

const SHOWN = 5;

// The first SHOWN of a list, indented under its summary line, and how many more are in the log.
export const capped = (lines) => (lines.length <= SHOWN
  ? lines
  : [...lines.slice(0, SHOWN), `… ${lines.length - SHOWN} more in check.log`]).map((line) => `    ${line}`);

// `root` is the checkout's top, which eslint's absolute paths are made relative to.
export function reasonLines(check, output, root) {
  const lines = stripVTControlCharacters(output).split(/\r?\n/);
  const reasons = REASONS[check](lines, root);
  return reasons.length > 0 ? reasons : errorLines(lines);
}
