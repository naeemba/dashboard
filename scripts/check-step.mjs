// `pnpm check`: runs each script check.mjs names in turn, its output into check.log at the checkout's top
// (ignored as `*.log`), then prints the summary lines, the first reasons under a failed one, a coverage
// line for the code changed against main (scripts/coverage.mjs), and the log's path.
/* global process, console */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHECKS, capped, reasonLines, summaryLine } from './check.mjs';
import { coverageLines, coveredFile } from './coverage.mjs';

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
// The local main of a worktree is as old as the worktree, so origin's comes first.
const base = ['origin/main', 'main'].map((ref) => git('merge-base', 'HEAD', ref)).find(({ status }) => status === 0)
  ?.stdout.trim();
const changed = base === undefined ? [] : [
  ...git('diff', '--name-only', base).stdout.split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').stdout.split('\n'),
].filter((file) => coveredFile(file) && existsSync(file));
const reports = changed.length > 0 ? mkdtempSync(join(tmpdir(), 'check-coverage-')) : undefined;
const env = reports === undefined
  ? process.env
  : { ...process.env, CHECK_COVERAGE: JSON.stringify({ include: changed, reportsDirectory: reports }) };

// The first few of a list under its summary line; the rest are in the log.
const under = (list) => capped(list, 'check.log').map((line) => `    ${line}`);

const logPath = resolve('check.log');
const log = openSync(logPath, 'w');
const lines = [];
let failed = false;
for (const check of CHECKS) {
  // `2>&1` reads the same in sh and cmd, so the log keeps a check's errors beside its other output.
  const { status, stdout } = spawnSync(`pnpm ${check} 2>&1`, { shell: true, encoding: 'utf8', maxBuffer: 1 << 28, env });
  writeSync(log, `\n=== pnpm ${check} ===\n${stdout}`);
  lines.push(summaryLine(check, stdout, status === 0));
  if (status !== 0) lines.push(...under(reasonLines(check, stdout)));
  failed ||= status !== 0;
}

if (reports === undefined) {
  lines.push(`${'coverage'.padEnd(9)}  no code changed against main`);
} else {
  const summaryPath = join(reports, 'coverage-summary.json');
  if (existsSync(summaryPath)) {
    const [head, ...files] = coverageLines(JSON.parse(readFileSync(summaryPath, 'utf8')), process.cwd());
    writeSync(log, `\n=== coverage ===\n${[head, ...files].join('\n')}\n`);
    lines.push(head, ...under(files));
  } else {
    lines.push(`${'coverage'.padEnd(9)}  no report: vitest wrote none`);
  }
  rmSync(reports, { recursive: true, force: true });
}
closeSync(log);
console.log([...lines, `Full output: ${logPath}`].join('\n'));
process.exit(failed ? 1 : 0);
