// The pre-commit hook's way into pre-commit.mjs, run by .githooks/pre-commit from the checkout's top
// (workflow-rule-5). The tsc run is package.json's `typecheck`.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { filesToCheck, markdownToCheck, missingToolsRefusal, runsTypecheck } from './pre-commit.mjs';
import { ESLINT, run } from './run-node.mjs';

// `tsc` in node_modules/.bin is TypeScript 7's, the package `@typescript/native`.
const TSC = 'node_modules/@typescript/native/bin/tsc';

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const tools = { toolsInstalled: existsSync(ESLINT) && existsSync(TSC) };
const refusal = missingToolsRefusal(staged, tools);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
const files = filesToCheck(staged);

const linted = files.length === 0 || run(ESLINT, ['--no-warn-ignored', ...files]);
const typed = !runsTypecheck(staged) || run(TSC, ['--noEmit']);
const markdown = markdownToCheck(staged);
const markdownPassed = markdown.length === 0 || run('scripts/markdown-step.mjs', markdown);
process.exit(linted && typed && markdownPassed ? 0 : 1);
