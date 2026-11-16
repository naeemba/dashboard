// The pre-commit hook's way into pre-commit.mjs, run by .githooks/pre-commit from the checkout's top
// (workflow-rule-5). The tsc run is package.json's `typecheck`.
/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { filesToCheck, runsTypecheck } from './pre-commit.mjs';

const ESLINT = 'node_modules/eslint/bin/eslint.js';
// `tsc` in node_modules/.bin is TypeScript 7's, the package `@typescript/native`.
const TSC = 'node_modules/@typescript/native/bin/tsc';

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const tools = { toolsInstalled: existsSync(ESLINT) && existsSync(TSC) };
const files = filesToCheck(staged, tools);

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }).status === 0;
const linted = files.length === 0 || run(ESLINT, ['--no-warn-ignored', ...files]);
const typed = !runsTypecheck(staged, tools) || run(TSC, ['--noEmit']);
process.exit(linted && typed ? 0 : 1);
