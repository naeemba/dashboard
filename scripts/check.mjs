// What `pnpm check` prints: one line a check, saying whether it passed and its counts, read from the
// check's own output. The entry is scripts/check-step.mjs, which keeps the full output in a log file.
import { stripVTControlCharacters } from 'node:util';
import { plural } from './run-node.mjs';

// A failed check that printed none of what is counted died before it ran (a missing module, a broken
// config), so it says so rather than `FAIL  0 errors`.
const counted = (count, noun, passed) => (count === 0 && !passed ? `no ${noun} count` : plural(count, noun));

// The counts in a check's output. Vitest says them on its `Tests` line; tsc's errors are one
// `error TS` line each; eslint and scripts/markdown-width-step.mjs each end on a `✖ N problems` line.
const COUNTS = {
  test: (output) => output.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? 'no test count',
  typecheck: (output, passed) => counted(output.match(/error TS\d+:/g)?.length ?? 0, 'error', passed),
  lint: (output, passed) => counted(
    [...output.matchAll(/✖ (\d+) problems?/g)].reduce((sum, match) => sum + Number(match[1]), 0),
    'problem',
    passed,
  ),
};

export const CHECKS = Object.keys(COUNTS);

export function summaryLine(check, output, passed) {
  return `${check.padEnd(9)}  ${passed ? 'pass' : 'FAIL'}  ${COUNTS[check](stripVTControlCharacters(output), passed)}`;
}
