// The wait that keeps the machine to one full test, build or typecheck run at a time
// (workflow-decision-14): a pane's Bash call that starts one is held in its PreToolUse hook while
// another runs anywhere on the machine, then let through. It runs inside `board guard`
// (board-program.ts) as `board guard --wait`, the entry only the app's sessions carry (board-guard.ts),
// after every refusal, so it reaches a worker in any project with no change there.
//
// The lock is the running process itself, read off /proc, so a run nothing claimed (a terminal of your
// own, a script) counts too, and a run that crashes holds nothing. The claim file is only for the
// moment between a wait ending and its process showing up: without it every waiting pane would see
// the machine free in the same poll and start together, which is the load this exists to stop.
// ponytail: one run at a time on any machine; a count from the cores if a big machine wastes them.
// ponytail: /proc only, so on a mac nothing waits, as the test-run guard refuses nothing there.

import { linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readText } from '../app/missing-file';
import { dirname } from 'node:path';
import { shellBody, simpleCommands, textField, wordsOf } from '../board/hook-answer';
import { commandProgram, shownCommand } from './test-run-guard';
import type { RunningProcess } from './running-app-guard';
import { GUARD_TIMEOUT } from '../board/board-guard';

// A package manager's script that runs a whole suite, build or typecheck: `pnpm check`, `npm run
// build:web`, `yarn type-check`.
const HEAVY_SCRIPT = /^(?:t|test|check|build|typecheck|type-check|tsc)$|^(?:test|build):/;
const TYPECHECKER = /^(?:tsc|vue-tsc)$/;
const BUNDLER = /^(?:vite|next|nuxt|astro|webpack)$/;
// Watch mode never ends, so a run in it would hold every pane until its wait ran out. `-w` is watch
// only past a package manager: to pnpm and npm it is the workspace flag (`pnpm -w build`).
const WATCH = /^(?:--watch(?:=true)?|--watchAll)$/;

// Whether these words, a command typed or a process's argv, run a whole suite, build or typecheck. A
// run naming what to run, a file, folder or filter (`vitest run src/a.test.ts`, `pnpm test -- board`,
// `cargo test name`), is the targeted rerun that confirms a failure, and never waits; `go test ./...`
// is the whole module.
// ponytail: a flag's value given apart from it (`--reporter dot`) reads as a target.
export function runsHeavy(words: readonly string[]): boolean {
  const program = commandProgram(words);
  if (program === null || words.some((word) => WATCH.test(word))) return false;
  if (!program.manager && program.after.includes('-w')) return false;
  const { name, rest } = program;
  if (program.runner) return rest.filter((word) => word !== 'run').length === 0;
  if (TYPECHECKER.test(name)) return true;
  if (BUNDLER.test(name)) return rest[0] === 'build';
  if (name === 'cargo') return /^(?:test|build|check)$/.test(rest[0] ?? '') && rest.length === 1;
  if (name === 'go') return /^(?:test|build|vet)$/.test(rest[0] ?? '') && rest.slice(1).every((word) => word === './...');
  if (!program.manager || rest.length === 0) return false;
  if (rest[0] === 'run' || rest[0] === 'run-script') return HEAVY_SCRIPT.test(rest[1] ?? '') && rest.length === 2;
  return HEAVY_SCRIPT.test(rest[0]) ? rest.length === 1 : runsHeavy(program.after);
}

// A redirect and its file, which no target is: `> out.log`, `2>/dev/null`, and the `2>` the line's
// split leaves of `2>&1`.
const REDIRECT = /\s*\d*[<>]+(?:&\d*)?(?:\s*[^\s<>]+)?/g;

// Whether a command line starts one, in any simple command or `sh -c` body.
export function startsHeavyRun(command: string): boolean {
  return simpleCommands(command).some((part) => {
    const body = shellBody(part);
    return body === null ? runsHeavy(wordsOf(part.replace(REDIRECT, ''))) : startsHeavyRun(body);
  });
}

// A claim another call holds, still fresh: its process may not be in /proc yet.
export const CLAIM_WINDOW = 30_000;
type Claim = { id: string; at: number };
const claimHeld = (claim: Claim | null, id: string, now: number) => claim !== null && claim.id !== id && now - claim.at < CLAIM_WINDOW;

// The claim as a file every pane's hook shares (`~/.cache/dashboard/heavy-run.claim` in guard()). Written
// whole beside it and linked into place, so it appears with its content and a second link fails: two
// calls never both take a claim that is not there.
// ponytail: a stale claim is removed and taken in two steps, so two calls replacing the same stale one
// in the same moment can both go; at one poll every two seconds that is rare and costs one doubled run.
export function claimFile(file: string, now: () => number = Date.now): (id: string) => boolean {
  return (id) => {
    const text = readText(file);
    if (claimHeld(parsedClaim(text), id, now())) return false;
    // A stale claim, one of this call's, or one that does not parse: gone, or nothing could take it.
    if (text !== null) rmSync(file, { force: true });
    mkdirSync(dirname(file), { recursive: true });
    const written = `${file}.${process.pid}`;
    writeFileSync(written, JSON.stringify({ id, at: now() }));
    try {
      linkSync(written, file);
      return true;
    } catch {
      return false;
    } finally {
      rmSync(written, { force: true });
    }
  };
}

function parsedClaim(text: string | null): Claim | null {
  try {
    return text === null ? null : JSON.parse(text) as Claim;
  } catch {
    return null;
  }
}

// What the wait reads and writes of the machine, passed in so a test can stand in for it. `claim`
// takes the claim file for `id` unless another call holds it (claimHeld), answering whether it did.
export type HeavyRunMachine = {
  listProcesses(): RunningProcess[] | null;
  claim(id: string): boolean;
  now(): number;
  sleep(milliseconds: number): void;
  // The terminal a process reads its input from (`/dev/pts/3`), or null for none: an agent's call has none.
  terminal(pid: number): string | null;
};

// Bare `vitest`, `vitest watch` or `vitest dev` on a terminal is watch mode with no flag saying so; with
// no terminal (an agent's call) it runs once. Its terminal is answered, so the package manager that
// started it there (`pnpm test` for a `"test": "vitest"` script) is read as the same watch.
function watchTerminal(process: RunningProcess, machine: HeavyRunMachine): string | null {
  const program = commandProgram(process.argv);
  if (program?.name !== 'vitest' || program.rest.some((word) => word !== 'watch' && word !== 'dev')) return null;
  return machine.terminal(process.pid);
}

// Under the wait entry's own timeout (WAIT_ENTRY, GUARD_TIMEOUT), so the wait ends with the call let through and a word
// saying so, not the hook killed.
export const LONGEST_WAIT = (GUARD_TIMEOUT - 60) * 1000;
const POLL = 2_000;

// Holds the call until no other heavy run is going and it holds the claim, or LONGEST_WAIT has gone
// by. Answers what the hook prints: '' when it waited for nothing or got its turn, a note to the agent
// when it gave up waiting. `id` is the tool call's, so the same call through two settings files is one.
export function waitForHeavyRuns(toolName: string, toolInput: unknown, id: string, machine: HeavyRunMachine): string {
  if (toolName !== 'Bash' || !startsHeavyRun(textField(toolInput, 'command'))) return '';
  const deadline = machine.now() + LONGEST_WAIT;
  let running: RunningProcess | undefined;
  while (machine.now() < deadline) {
    const processes = machine.listProcesses();
    if (processes === null) return '';
    const watching = new Set(processes.map((process) => watchTerminal(process, machine)).filter((terminal) => terminal !== null));
    running = processes.find((process) => runsHeavy(process.argv) && !watching.has(machine.terminal(process.pid) ?? ''));
    if (running === undefined && machine.claim(id)) return '';
    machine.sleep(POLL);
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: gaveUp(running) } });
}

const gaveUp = (running: RunningProcess | undefined) => `Waited ${LONGEST_WAIT / 60_000} minutes for `
  + (running === undefined ? 'another pane\'s run to start' : `pid ${running.pid} (${shownCommand(running)})`)
  + ' to finish, then let this run start beside it. A failure in it may be load: rerun only the failed files.';
