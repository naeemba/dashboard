// `pnpm check`: runs each script check.mjs names in turn, its output into check.log at the checkout's top
// (ignored as `*.log`), then prints the summary lines and the log's path.
/* global process, console */
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHECKS, summaryLine } from './check.mjs';

const logPath = resolve('check.log');
const log = openSync(logPath, 'w');
const lines = [];
let failed = false;
for (const check of CHECKS) {
  writeSync(log, `\n=== pnpm ${check} ===\n`);
  const start = readFileSync(logPath, 'utf8').length;
  const { status } = spawnSync('pnpm', [check], { stdio: ['ignore', log, log], shell: process.platform === 'win32' });
  lines.push(summaryLine(check, readFileSync(logPath, 'utf8').slice(start), status === 0));
  failed ||= status !== 0;
}
closeSync(log);
console.log([...lines, `Full output: ${logPath}`].join('\n'));
process.exit(failed ? 1 : 0);
