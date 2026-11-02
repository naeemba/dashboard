// Refuse to package while an app is running out of this checkout. Packaging wipes out/ and
// .vite/, and pulling those files out from under a process that is executing them is a
// SIGBUS crash on a mac or Linux; on Windows the files are locked instead and packaging dies
// half way with EBUSY. Runs as npm's prepackage and premake hooks, since electron-forge make
// packages first and wipes the same folders.
//
// Node rather than sh so the same npm hook runs on Windows, where npm runs scripts with cmd.exe
// and there is no ps: the process list comes from PowerShell there instead.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runningFromRepository } from './running-app.mjs';

const repositoryPath = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));

function commandLines() {
  if (process.platform !== 'win32') return execFileSync('ps', ['-Ao', 'command='], { encoding: 'utf8' }).split('\n');
  const script = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }';
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).split(/\r?\n/);
}

const running = runningFromRepository(commandLines(), repositoryPath, process.platform);
if (running.length === 0) process.exit(0);

console.error('Stopped: an app is running out of this repo, and building would delete the files it is');
console.error('executing. Quit it first, or restart it from the installed app instead.');
for (const line of running) console.error(line.slice(0, 160));
process.exit(1);
