// What `pnpm check` prints: one line a check, saying whether it passed and its counts, read from the
// check's own output. The entry is scripts/check-step.mjs, which keeps the full output in a log file.
import { stripVTControlCharacters } from 'node:util';

export const CHECKS = ['test', 'typecheck', 'lint'];

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// The counts in a check's output. Vitest says them on its `Tests` line; tsc's errors are one
// `error TS` line each; eslint and scripts/markdown-width-step.mjs each end on a `✖ N problems` line.
const COUNTS = {
  test: (output) => output.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? 'no test count',
  typecheck: (output) => plural(output.match(/error TS\d+:/g)?.length ?? 0, 'error'),
  lint: (output) => plural(
    [...output.matchAll(/✖ (\d+) problems?/g)].reduce((sum, match) => sum + Number(match[1]), 0),
    'problem',
  ),
};

export function summaryLine(check, output, passed) {
  return `${check.padEnd(9)}  ${passed ? 'pass' : 'FAIL'}  ${COUNTS[check](stripVTControlCharacters(output))}`;
}
