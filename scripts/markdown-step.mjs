// The markdown half of `pnpm lint`: reads the files named after it (the pre-commit hook's staged ones), else
// every tracked file markdown-width.mjs checks that is still on disk (a deletion not yet staged is
// still tracked), and prints each line over the width and each bad docs id (docs-ids.mjs), then a
// count in eslint's shape, which scripts/check.mjs reads.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { WIDTH, checkedFile, longLines } from './markdown-width.mjs';
import { idProblems } from './docs-ids.mjs';
import { plural } from './check.mjs';

const named = process.argv.slice(2);
const files = named.length > 0
  ? named
  : execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' }).split('\0')
    .filter((file) => checkedFile(file) && existsSync(file));
let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const found = [
    ...longLines(text).map(({ line, length }) => ({ line, problem: `${length} columns, over ${WIDTH}` })),
    ...idProblems(text),
  ];
  for (const { line, problem } of found.sort((one, other) => one.line - other.line)) {
    console.error(`${file}:${line}  ${problem}`);
    problems += 1;
  }
}
if (problems > 0) {
  console.error(`\n✖ ${plural(problems, 'problem')} (markdown lines over ${WIDTH} columns to rewrap, or docs ids to fix)`);
  process.exit(1);
}
