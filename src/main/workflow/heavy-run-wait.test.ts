import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runningProcess } from './running-app-guard';
import { CLAIM_WINDOW, claimFile, LONGEST_WAIT, runsHeavy, startsHeavyRun, waitForHeavyRuns, type HeavyRunMachine } from './heavy-run-wait';
import { temporaryFolder } from '../testing/temporary-folder';

describe('startsHeavyRun', () => {
  it.each([
    'pnpm test',
    'pnpm check',
    'pnpm typecheck',
    'npm run build',
    'npm run build:web',
    'yarn type-check',
    'pnpm test -- --coverage',
    'vitest run --maxWorkers=2',
    'npx vitest run',
    'pnpm exec jest',
    'tsc --noEmit',
    'vite build',
    'next build',
    'cargo test',
    'go test ./...',
    'pytest -x',
    'timeout 600 pnpm test 2>&1 | tail -20',
    'cd packages/core && pnpm build',
    "sh -c 'pnpm check'",
    'pnpm check > check.log 2>/dev/null',
    'pnpm -w build',
  ])('holds %s', (command) => {
    expect(startsHeavyRun(command)).toBe(true);
  });

  it.each([
    'pnpm test src/main/a.test.ts',
    'pnpm test -- board',
    'npx vitest run src/a.test.ts src/b.test.ts',
    'pytest tests/test_board.py::test_move',
    'cargo test move_card',
    'go test ./internal/board',
    'vitest --watch',
    'tsc --watch',
    'tsc -w',
    'pnpm vitest -w',
    'pnpm dev',
    'vite',
    'pnpm lint',
    'pnpm add -D vitest',
    'git commit -m "pnpm test is flaky"',
  ])('lets %s through', (command) => {
    expect(startsHeavyRun(command)).toBe(false);
  });

  it('reads a process argv the same way', () => {
    expect(runsHeavy(['/usr/bin/node', '/app/node_modules/pnpm/bin/pnpm.cjs', 'check'])).toBe(true);
    expect(runsHeavy(['node', '/app/node_modules/vitest/vitest.mjs', 'run'])).toBe(true);
    expect(runsHeavy(['node', '/app/node_modules/vitest/dist/workers/forks.js'])).toBe(false);
    // Bare vitest runs once with no terminal, as an agent's call has; on one it is watch (waitForHeavyRuns).
    expect(runsHeavy(['node', '/app/node_modules/vitest/vitest.mjs'])).toBe(true);
  });
});

// A clock a sleep moves, a process table that can change as it does, and a claim another call holds
// until `heldUntil`, and the terminal each pid reads from.
function machineWith(table: (now: number) => string[][] | null, heldUntil = 0, terminals: Record<number, string> = {}) {
  let now = 0;
  const claims: string[] = [];
  const machine: HeavyRunMachine = {
    listProcesses: () => table(now)?.map((argv, index) => runningProcess(100 + index, 'node', argv)) ?? null,
    claim: (id) => (now < heldUntil ? false : (claims.push(id), true)),
    now: () => now,
    sleep: (milliseconds) => { now += milliseconds; },
    terminal: (pid) => terminals[pid] ?? null,
  };
  return { machine, claims, waited: () => now };
}
const bash = (command: string) => ['Bash', { command }, 'call-1'] as const;

describe('waitForHeavyRuns', () => {
  it('waits for another full run to end, then claims its turn', () => {
    const { machine, claims, waited } = machineWith((now) => (now < 10_000 ? [['pnpm', 'test']] : []));
    expect(waitForHeavyRuns(...bash('pnpm check'), machine)).toBe('');
    expect(waited()).toBe(10_000);
    expect(claims).toEqual(['call-1']);
  });

  it('waits while another call holds the claim', () => {
    const { machine, waited } = machineWith(() => [], 6_000);
    expect(waitForHeavyRuns(...bash('pnpm test'), machine)).toBe('');
    expect(waited()).toBe(6_000);
  });

  it('never holds a targeted rerun, another tool, or a machine with no process table', () => {
    const busy = () => [['pnpm', 'test']];
    expect(waitForHeavyRuns(...bash('pnpm test src/a.test.ts'), machineWith(busy).machine)).toBe('');
    expect(waitForHeavyRuns('Read', { command: 'pnpm test' }, 'call-1', machineWith(busy).machine)).toBe('');
    const mac = machineWith(() => null);
    expect(waitForHeavyRuns(...bash('pnpm test'), mac.machine)).toBe('');
    expect(mac.claims).toEqual([]);
  });

  it('never waits on a vitest watching in a terminal, or the pnpm that started it there', () => {
    const watcher = machineWith(() => [['pnpm', 'test'], ['node', '/app/node_modules/vitest/vitest.mjs']], 0, { 100: '/dev/pts/3', 101: '/dev/pts/3' });
    expect(waitForHeavyRuns(...bash('pnpm check'), watcher.machine)).toBe('');
    expect(watcher.waited()).toBe(0);
    const otherTerminal = machineWith((now) => (now < 4_000 ? [['pnpm', 'check'], ['vitest']] : []), 0, { 100: '/dev/pts/5', 101: '/dev/pts/3' });
    expect(waitForHeavyRuns(...bash('pnpm check'), otherTerminal.machine)).toBe('');
    expect(otherTerminal.waited()).toBe(4_000);
  });

  it('gives up at its limit and tells the agent, naming the run it waited on', () => {
    const { machine, claims, waited } = machineWith(() => [['vitest', 'run']]);
    const answer = JSON.parse(waitForHeavyRuns(...bash('pnpm test'), machine));
    expect(waited()).toBe(LONGEST_WAIT);
    expect(claims).toEqual([]);
    expect(answer.hookSpecificOutput.additionalContext).toContain('pid 100 (vitest run)');
  });
});

describe('claimFile', () => {
  const claimPath = () => join(temporaryFolder('heavy-run-claim-'), 'heavy-run.claim');

  it('lets one call hold the claim through its window, and the same call take it again', () => {
    let now = 1_000;
    const claim = claimFile(claimPath(), () => now);
    expect(claim('a')).toBe(true);
    expect(claim('b')).toBe(false);
    expect(claim('a')).toBe(true);
    now += CLAIM_WINDOW;
    expect(claim('b')).toBe(true);
  });

  it('takes the claim over a file that does not parse', () => {
    const file = claimPath();
    writeFileSync(file, '{');
    expect(claimFile(file)('a')).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).id).toBe('a');
  });

  it('answers false when another call links its claim in first', () => {
    const file = claimPath();
    let calls = 0;
    // The second reading of the clock is the write: another call takes the claim just before it links.
    const now = () => {
      calls += 1;
      if (calls === 2) writeFileSync(file, JSON.stringify({ id: 'b', at: 0 }));
      return 0;
    };
    expect(claimFile(file, now)('a')).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8')).id).toBe('b');
  });
});
