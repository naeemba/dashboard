// `pnpm check`: runs each script check.mjs names in turn, its output into check.log at the checkout's top
// (ignored as `*.log`), then prints the summary lines, the first reasons under a failed one, a coverage
// line for the code changed against main (scripts/coverage.mjs), and the log's path.
/* global process, console */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHECKS, capped, reasonLines, summaryLine } from './check.mjs';
import { BASE_REFS, coverageLines, coveredFile, mergeBase } from './coverage.mjs';

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const base = mergeBase(BASE_REFS.map((ref) => git('merge-base', 'HEAD', ref)));
const changed = base === undefined ? [] : [
  ...git('diff', '--name-only', '--diff-filter=d', base).stdout.split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').stdout.split('\n'),
].filter(coveredFile);
const reportsDirectory = changed.length > 0 ? mkdtempSync(join(tmpdir(), 'check-coverage-')) : undefined;
const testEnvironment = reportsDirectory === undefined
  ? process.env
  : { ...process.env, CHECK_COVERAGE: JSON.stringify({ include: changed, reportsDirectory }) };

const logPath = resolve('check.log');
const log = openSync(logPath, 'w');
const lines = [];
let failed = false;
for (const check of CHECKS) {
  // `2>&1` reads the same in sh and cmd, so the log keeps a check's errors beside its other output.
  const { status, stdout } = spawnSync(`pnpm ${check} 2>&1`, { shell: true, encoding: 'utf8', maxBuffer: 1 << 28, env: check === 'test' ? testEnvironment : process.env });
  writeSync(log, `\n=== pnpm ${check} ===\n${stdout}`);
  lines.push(summaryLine(check, stdout, status === 0));
  if (status !== 0) lines.push(...capped(reasonLines(check, stdout, process.cwd())));
  failed ||= status !== 0;
}

const summaryPath = reportsDirectory && join(reportsDirectory, 'coverage-summary.json');
const summary = summaryPath && existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : undefined;
if (reportsDirectory) rmSync(reportsDirectory, { recursive: true, force: true });
const report = coverageLines(summary, changed, process.cwd());
writeSync(log, `\n=== coverage ===\n${report.join('\n')}\n`);
lines.push(report[0], ...capped(report.slice(1)));
closeSync(log);
console.log([...lines, `Full output: ${logPath}`].join('\n'));
process.exit(failed ? 1 : 0);
