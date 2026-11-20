// The PreToolUse hook that keeps a worktree to one test run at a time: a test command is refused while
// another runs in the same worktree, naming it (workflow-decision-12 says what counts and why). It
// runs inside `board guard` (board-program.ts), so it reaches every project the user's
// ~/.claude/settings.json does.
// ponytail: it reads /proc, so on a mac (no /proc) nothing is refused; `ps` and `lsof -d cwd` would
// cover it if parallel runs show up there.

import { basename } from 'node:path';
import { hookRefusal, invocation, repositoryTop, shellBody, simpleCommands, textField, wordsOf } from '../board/hook-answer';
import { isInside } from '../panes/shell-directory';
import type { ProcessList, RunningProcess } from './running-app-guard';
import { resolveWord } from './worktree-guard';

// What may stand before the program a command line runs, with its flags, assignments and timeout's
// duration: `timeout 600 pnpm test`, `node --max-old-space-size=4096 vitest.mjs`, `python3 -m pytest`.
const LAUNCHER = /^(?:sudo|env|command|exec|nohup|nice|time|timeout|node|nodejs|npx|pnpx|bunx|python[\d.]*)$/;
const SKIPPED = /^(?:-.*|\w+=.*|\d+(?:\.\d+)?[smhd]?)$/;
const RUNNER = /^(?:vitest|jest|pytest|py\.test)$/;
const MANAGER = /^(?:npm|pnpm|yarn|bun)$/;
const TEST_SCRIPT = /^(?:t|test|check)$|^test:/;

// A program's name from its path: `node_modules/vitest/vitest.mjs` and `pnpm.cjs` and `npm-cli.js`
// are vitest, pnpm and npm.
const programName = (word: string) => basename(word).replace(/\.[mc]?js$/, '').replace(/-cli$/, '');

// Whether these words, a command typed or a process's argv, run tests: a runner (vitest, jest,
// pytest), a package manager's test or check script (`pnpm test`, `npm run test:unit`, `bun test`), a
// runner through one (`pnpm vitest`, `pnpm exec jest`), or `cargo test` and `go test`.
export function runsTests(words: readonly string[]): boolean {
  let index = 0;
  while (index < words.length && (SKIPPED.test(words[index]) || LAUNCHER.test(basename(words[index])))) {
    index += 1;
  }
  if (index >= words.length) return false;
  const name = programName(words[index]);
  const rest = words.slice(index + 1).filter((word) => !word.startsWith('-'));
  if (RUNNER.test(name)) return true;
  if (name === 'cargo' || name === 'go') return rest[0] === 'test';
  if (!MANAGER.test(name) || rest.length === 0) return false;
  if (rest[0] === 'run' || rest[0] === 'run-script') return TEST_SCRIPT.test(rest[1] ?? '');
  return TEST_SCRIPT.test(rest[0]) || runsTests(rest);
}

// The folders the test runs a command line starts run in, `sh -c '…'` bodies included: `folder`, or
// where a `cd` earlier in the line moved to (`cd ../app.worktrees/card && pnpm test`).
// ponytail: a `cd` inside a `( … )` subshell is followed past its end, and `pnpm -C <dir>` is not
// read; worktree-guard.ts counts subshells if a run is ever judged in the wrong worktree that way.
export function testRunFolders(command: string, folder: string): string[] {
  const folders: string[] = [];
  let base = folder;
  for (const part of simpleCommands(command)) {
    const body = shellBody(part);
    if (body !== null) folders.push(...testRunFolders(body, base));
    else if (runsTests(wordsOf(part))) folders.push(base);
    const changed = invocation(part, 'cd');
    if (changed) base = resolveWord(changed.words[0] ?? '~', base);
  }
  return folders;
}

// The folder a process works in, or null where it cannot be read (another user's process).
export type WorkingFolder = (pid: number) => string | null;

// The test run going in the same worktree as `folder`, the earliest started (lowest pid) of them, or
// undefined. A process counts by its working folder's repository top, so a worktree nested inside the
// checkout (`.adopt-docs`) is not the checkout's. A folder is read only for a test run, and walked up
// only when it is inside this worktree's.
export function runningTestRun(folder: string, machine: TestRunMachine): RunningProcess | undefined {
  const top = repositoryTop(folder, machine.exists);
  if (top === null) return undefined;
  const inWorktree = (process: RunningProcess) => {
    const processFolder = machine.workingFolder(process.pid);
    return processFolder !== null && isInside(processFolder, top)
      && repositoryTop(processFolder, machine.exists) === top;
  };
  return (machine.listProcesses() ?? [])
    .filter((process) => runsTests(process.argv) && inWorktree(process))
    .sort((first, second) => first.pid - second.pid)[0];
}

// What the guard reads of the machine, passed in so a test can stand in for it.
export type TestRunMachine = { listProcesses: ProcessList; workingFolder: WorkingFolder; exists: (path: string) => boolean };

const LONGEST_SHOWN = 160;

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through. The command
// is read before the process table, so a call that runs no tests reads nothing.
export function testRunGuard(toolName: string, toolInput: unknown, folder: string | undefined, machine: TestRunMachine) {
  if (toolName !== 'Bash' || folder === undefined) return undefined;
  const folders = [...new Set(testRunFolders(textField(toolInput, 'command'), folder))];
  const running = folders.map((each) => runningTestRun(each, machine)).find((each) => each !== undefined);
  if (running === undefined) return undefined;
  const shown = running.commandLine.length > LONGEST_SHOWN ? `${running.commandLine.slice(0, LONGEST_SHOWN)}…` : running.commandLine;
  return hookRefusal(
    `A test run is already going in this worktree (pid ${running.pid}: ${shown}). `
    + 'Wait for it to end, then run yours: two at once in one worktree have filled the machine\'s memory. '
    + 'Never run tests in parallel.',
  );
}
