import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parentProcesses } from './pane-sessions';
import { familiesOf, lsofDirectories } from './shell-directory';

// Where every pane's shell, and everything it started, is standing right now — what the review sweep
// asks before it removes a finished card's worktree. Which of those folders count is
// shell-directory.ts's, and it is tested there.
//
// Out of main.ts because main had reached the 600-line ceiling. No test file, under the exemption
// CLAUDE.md gives spawning: this runs `ps` and `lsof` and hands the text on, and a test of that is a
// test of mocks. The reading of both outputs is in shell-directory.ts, beside its tests.
//
// One `ps` and one `lsof` per tick, whatever the number of shells and cards. `lsof` takes a list of
// pids and answers for all of them in about the time it takes for one, so twenty shells cost what
// one does; one call per shell would be twenty processes every five seconds for as long as a pane
// sits in a finished worktree.

const runCommand = promisify(execFile);

// Long enough for a slow machine, short enough that `lsof` stuck on an unreachable network mount
// cannot have the next tick's call start on top of it.
const ASK_TIMEOUT_MS = 2_000;

export type ShellDirectories = (shellPids: readonly number[]) => Promise<Map<number, string[]>>;

// Every card that asks while one question is out gets that question's answer. The sweep walks its
// cards all at once, so that is every card on one tick.
export function shellDirectories(): ShellDirectories {
  let asking: Promise<Map<number, string[]>> | null = null;
  return (shellPids) => {
    asking ??= familyDirectories(shellPids).finally(() => { asking = null; });
    return asking;
  };
}

async function familyDirectories(shellPids: readonly number[]): Promise<Map<number, string[]>> {
  const tree = await output('ps', ['-eo', 'pid=,ppid=']);
  const families = familiesOf(parentProcesses(tree), shellPids);
  const directories = await directoriesOf([...new Set([...families.values()].flat())]);
  return new Map([...families].map(([shellPid, family]) =>
    [shellPid, family.flatMap((pid) => directories.get(pid) ?? [])]));
}

// Each process's folder. A process that is gone, or cannot be asked, is missing from the answer.
async function directoriesOf(pids: readonly number[]): Promise<Map<number, string>> {
  if (pids.length === 0 || process.platform === 'win32') return new Map();
  if (process.platform === 'linux') {
    const answers = await Promise.all(pids.map(async (pid) =>
      [pid, await readlink(`/proc/${pid}/cwd`).catch(() => null)] as const));
    return new Map(answers.flatMap(([pid, directory]) => (directory === null ? [] : [[pid, directory]])));
  }
  return lsofDirectories(await output('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn']));
}

// What a command printed, even when it failed: `lsof` exits 1 when any pid in its list has already
// gone, and still prints every one that has not. Empty when it printed nothing or could not run.
async function output(command: string, commandArguments: string[]): Promise<string> {
  try {
    return (await runCommand(command, commandArguments, { timeout: ASK_TIMEOUT_MS })).stdout;
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    return typeof stdout === 'string' ? stdout : '';
  }
}
