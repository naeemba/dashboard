// `pnpm check`: runs each script check.mjs names in turn, its output into check.log at the checkout's top
// (ignored as `*.log`), then prints the summary lines and the log's path.
/* global process, console */
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHECKS, summaryLine } from './check.mjs';

const logPath = resolve('check.log');
const log = openSync(logPath, 'w');
const lines = [];
let failed = false;
for (const check of CHECKS) {
  // `2>&1` reads the same in sh and cmd, so the log keeps a check's errors beside its other output.
  const { status, stdout } = spawnSync(`pnpm ${check} 2>&1`, { shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
  writeSync(log, `\n=== pnpm ${check} ===\n${stdout}`);
  lines.push(summaryLine(check, stdout, status === 0));
  failed ||= status !== 0;
}
closeSync(log);
console.log([...lines, `Full output: ${logPath}`].join('\n'));
process.exit(failed ? 1 : 0);
