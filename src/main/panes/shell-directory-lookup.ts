import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parentProcesses } from '../workers/pane-sessions';
import { realPath } from '../ship/worktree-scan';
import {
  anyShellStandsIn, answerDespiteFailure, familiesOf, lsofDirectories, oneQuestionAtATime, type ShellDirectories,
} from './shell-directory';

// Where every pane's shell, and everything it started, is standing right now — what the review sweep
// asks before it removes a finished card's worktree. What those answers mean is shell-directory.ts's,
// and it is tested there, including how one question is shared between the cards asking it.
//
// Out of main.ts because main had reached the 600-line ceiling. The spawning half (`lsof`, `ps` through
// the `processTree` main hands it) has no test, under the exemption CLAUDE.md gives spawning: a test of
// that is a test of mocks. shellLiveness, the one branch here, is tested in shell-directory-lookup.test.ts.
//
// One `ps` and one `lsof` per tick, whatever the number of shells and cards. `lsof` takes a list of
// pids and answers for all of them in about the time it takes for one, so twenty shells cost what
// one does; one call per shell would be twenty processes every five seconds for as long as a pane
// sits in a finished worktree.

const runCommand = promisify(execFile);

// Long enough for a slow machine, short enough that `lsof` stuck on an unreachable network mount
// cannot have the next tick's call start on top of it.
const ASK_TIMEOUT_MS = 2_000;

// `processTree` is the one `ps` main hands to both sweeps, so the token figures and this read the
// same tree.
export function shellDirectories(
  processTree: () => Promise<string | null>,
): (shellPids: readonly number[]) => Promise<ShellDirectories> {
  return oneQuestionAtATime((shellPids: readonly number[]) => familyDirectories(processTree, shellPids));
}

// Whether any pane's shell stands in this folder, which is what the review sweep waits on before it
// removes a finished card's worktree. shell-directory.ts says which folders count and what an
// unanswered question means; this asks each live shell, and what it started, where it is now, since a
// `cd` typed into a pane never reaches the folder the pane was opened in.
export function shellLiveness(held: {
  shells: ReadonlyMap<string, { pid: number }>;
  opened: ReadonlyMap<string, { directory: string }>;
  shellsIn(worktreePath: string): string[];
  ask(shellPids: readonly number[]): Promise<ShellDirectories>;
}): (worktreePath: string) => Promise<boolean> {
  return async (worktreePath) => {
    // The cheap answer first: a shell opened there needs no process spawned to ask where it is.
    if (held.shellsIn(worktreePath).length > 0) return true;
    const live = Array.from(held.shells, ([id, { pid }]) => ({ opened: held.opened.get(id)?.directory ?? '', pid }));
    const directories = await held.ask(live.map(({ pid }) => pid));
    return anyShellStandsIn(live, directories, worktreePath, realPath(worktreePath));
  };
}

async function familyDirectories(
  processTree: () => Promise<string | null>, shellPids: readonly number[],
): Promise<ShellDirectories> {
  // No way to ask on Windows: the folder each pane was opened in is the only answer there is.
  if (shellPids.length === 0 || process.platform === 'win32') return new Map();
  const tree = await processTree();
  if (tree === null) return null;
  const families = familiesOf(parentProcesses(tree), shellPids);
  const directories = await directoriesOf([...new Set([...families.values()].flat())]);
  if (directories === null) return null;
  return new Map([...families].map(([shellPid, family]) =>
    [shellPid, family.flatMap((pid) => directories.get(pid) ?? [])]));
}

// Each process's folder. A process that is gone, or cannot be asked, is missing from the answer.
// Exported for file-open.ts, which asks it about one pane's shell when a path printed there is opened.
export async function directoriesOf(pids: readonly number[]): Promise<Map<number, string> | null> {
  if (process.platform === 'linux') {
    const answers = await Promise.all(pids.map(async (pid) =>
      [pid, await readlink(`/proc/${pid}/cwd`).catch(() => null)] as const));
    return new Map(answers.flatMap(([pid, directory]) => (directory === null ? [] : [[pid, directory]])));
  }
  const listing = await commandOutput('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn']);
  return listing === null ? null : lsofDirectories(listing);
}

// What a command printed, or `null` when it gave no answer. Which failures still carry one is
// answerDespiteFailure's, in shell-directory.ts.
export async function commandOutput(command: string, commandArguments: string[]): Promise<string | null> {
  try {
    return (await runCommand(command, commandArguments, { timeout: ASK_TIMEOUT_MS })).stdout;
  } catch (error) {
    return answerDespiteFailure(error);
  }
}
