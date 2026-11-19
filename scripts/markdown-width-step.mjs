// The markdown half of `pnpm lint`: reads the files named after it (the pre-commit hook's staged ones), else
// every tracked file markdown-width.mjs checks, and prints each line over the width, then a count in
// eslint's shape, which scripts/check.mjs reads.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WIDTH, checkedFile, longLines } from './markdown-width.mjs';

const named = process.argv.slice(2);
const files = named.length > 0
  ? named
  : execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' }).split('\0').filter(checkedFile);
let problems = 0;
for (const file of files) {
  for (const { line, length } of longLines(readFileSync(file, 'utf8'))) {
    console.error(`${file}:${line}  ${length} columns, over ${WIDTH}`);
    problems += 1;
  }
}
if (problems > 0) {
  console.error(`\n✖ ${problems} problem${problems === 1 ? '' : 's'} (markdown lines over ${WIDTH} columns; rewrap them)`);
  process.exit(1);
}
