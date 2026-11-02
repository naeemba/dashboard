// Refuse to package while an app is running out of this checkout. Packaging wipes out/ and
// .vite/, and pulling those files out from under a process that is executing them is a
// SIGBUS crash on a mac or Linux; on Windows the files are locked instead and packaging dies
// half way with EBUSY. Runs as npm's prepackage hook, so it covers every route to a build.
//
// Node rather than sh so the same npm hook runs on Windows, where npm runs scripts with cmd.exe
// and there is no ps: the process list comes from PowerShell there instead.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Forward slashes on every platform, so one pattern reads a Windows command line and a POSIX one.
const slashes = (text) => text.replaceAll('\\', '/');
const repo = slashes(realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..')));

function commandLines() {
  if (process.platform !== 'win32') return execFileSync('ps', ['-Ao', 'command='], { encoding: 'utf8' }).split('\n');
  const script = 'Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }';
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).split(/\r?\n/);
}

// Windows paths are not case sensitive, and a command line may spell the drive either way.
const fold = process.platform === 'win32' ? (text) => text.toLowerCase() : (text) => text;
const running = commandLines().filter((line) => {
  const command = fold(slashes(line));
  return command.includes(fold(`${repo}/`)) && /\/(out|\.vite)\/|\/node_modules\/electron\//.test(command);
});
if (running.length === 0) process.exit(0);

console.error('Stopped: an app is running out of this repo, and building would delete the files it is');
console.error('executing. Quit it first, or restart it from the installed app instead.');
for (const line of running) console.error(line.slice(0, 160));
process.exit(1);
