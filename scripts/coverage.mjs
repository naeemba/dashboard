// The coverage line of `pnpm check`: how much of each code file the branch changed against main its
// tests run, so a new branch with no test shows before review does (workflow-rule-2). It rides on the
// check's own `pnpm test`, which vitest.config.ts turns coverage on for when CHECK_COVERAGE names the
// files, so it costs no second run. It never fails the check: a view has no test environment.
import { relative } from 'node:path';
import { label, plural } from './check.mjs';

// The code a test could cover: the TypeScript and Node scripts under src/ and scripts/, not a test or
// a declaration.
export const coveredFile = (file) => /^(src|scripts)\/.+\.(ts|mjs)$/.test(file)
  && !/\.test\.(ts|mjs)$/.test(file) && !file.endsWith('.d.ts');

// Each changed file a test leaves partly unrun, from vitest's json-summary (absolute paths), with the
// line that heads them.
export function coverageLines(summary, root) {
  const files = Object.entries(summary).filter(([file]) => file !== 'total');
  const untested = files
    .filter(([, { lines, branches }]) => lines.covered < lines.total || branches.covered < branches.total)
    .map(([file, { lines, branches }]) => `${relative(root, file)}  ${lines.covered === 0
      ? 'no test runs it'
      : `${branches.covered} of ${branches.total} branches, ${lines.covered} of ${lines.total} lines`}`);
  const head = `${label('coverage')}${plural(files.length, 'changed file')}, ${untested.length} not fully tested`;
  return [head, ...untested];
}
