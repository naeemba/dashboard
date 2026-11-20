import { describe, expect, it } from 'vitest';
import { runningProcess } from './running-app-guard';
import { runsTests, startsTestRun, testRunGuard } from './test-run-guard';

// The guard joins with the platform's separator, so on Windows it asks for `\work\app\.git`.
const files = (...paths: string[]) => (path: string) => paths.includes(path.replaceAll('\\', '/'));
const repositories = files('/work/app/.git', '/work/app.worktrees/card/.git', '/work/app/.adopt-docs/.git');
type Running = { process: ReturnType<typeof runningProcess>; folder: string | null };
const running = (pid: number, commandLine: string, folder: string | null): Running => ({ process: runningProcess(pid, 'node', commandLine.split(' ')), folder });
const machineWith = (...processes: Running[]) => ({
  listProcesses: () => processes.map((each) => each.process),
  workingFolder: (pid: number) => processes.find((each) => each.process.pid === pid)?.folder ?? null,
  exists: repositories,
});
const reason = (answer: ReturnType<typeof testRunGuard>) => answer?.hookSpecificOutput.permissionDecisionReason;

describe('startsTestRun', () => {
  it.each([
    'pnpm test',
    'pnpm check',
    'npm test',
    'npm t',
    'npm run test:unit',
    'yarn test --watch=false',
    'bun test',
    'vitest run --maxWorkers=2',
    'npx vitest run src/a.test.ts',
    'pnpm vitest run',
    'pnpm exec jest',
    './node_modules/.bin/jest',
    'pytest -x',
    'python3 -m pytest tests',
    'cargo test',
    'go test ./...',
    'CI=1 pnpm test',
    'timeout 600 pnpm test 2>&1 | tail -20',
    'cd packages/core && pnpm test',
    "sh -c 'pnpm test'",
  ])('reads %s as a test run', (command) => {
    expect(startsTestRun(command)).toBe(true);
  });

  it.each([
    'pnpm typecheck',
    'pnpm lint',
    'pnpm add -D vitest',
    'npm install jest',
    'git commit -m "pnpm test is flaky"',
    'grep -rn vitest src',
    'cat vitest.config.ts',
    'nvim jest.config.js',
    'cargo build',
  ])('reads %s as no test run', (command) => {
    expect(startsTestRun(command)).toBe(false);
  });
});

describe('runsTests on a process argv', () => {
  it('recognises the processes a test run is, through node and pnpm', () => {
    expect(runsTests(['/usr/bin/node', '/work/app/node_modules/vitest/vitest.mjs', 'run'])).toBe(true);
    expect(runsTests(['node', '/usr/lib/node_modules/pnpm/bin/pnpm.cjs', 'check'])).toBe(true);
    expect(runsTests(['/usr/bin/python3', '/usr/bin/pytest'])).toBe(true);
  });

  it('leaves out a shell, an editor and a worker that only carry the word', () => {
    expect(runsTests(['/bin/zsh', '-c', "eval 'pnpm test'"])).toBe(false);
    expect(runsTests(['nvim', 'test'])).toBe(false);
    expect(runsTests(['node', '/work/app/node_modules/vitest/dist/workers/forks.js'])).toBe(false);
  });
});

describe('testRunGuard', () => {
  const vitest = running(4100, 'node /work/app/node_modules/vitest/vitest.mjs run', '/work/app');
  const pnpm = running(4090, 'node /usr/lib/pnpm/pnpm.cjs test', '/work/app');
  const guard = (command: string, folder: string, ...processes: Running[]) =>
    testRunGuard('Bash', { command }, folder, machineWith(...processes));

  it('refuses a second run in the same worktree, naming the earliest one running', () => {
    const answer = reason(guard('pnpm test', '/work/app/src', vitest, pnpm));
    expect(answer).toContain('pid 4090: node /usr/lib/pnpm/pnpm.cjs test');
    expect(answer).toContain('Wait for it to end');
  });

  it('refuses from a subfolder when the run started in another subfolder of the worktree', () => {
    const inPackage = running(5000, 'vitest run', '/work/app/packages/core');
    expect(reason(guard('pnpm check', '/work/app', inPackage))).toContain('pid 5000');
  });

  it('lets a run through while the only one going is in another worktree', () => {
    expect(guard('pnpm test', '/work/app.worktrees/card', vitest)).toBeUndefined();
    const nested = running(6000, 'vitest run', '/work/app/.adopt-docs');
    expect(guard('pnpm test', '/work/app', nested)).toBeUndefined();
  });

  it('lets through what is no test run, and a run where none is going', () => {
    expect(guard('pnpm lint', '/work/app', vitest)).toBeUndefined();
    expect(guard('pnpm test', '/work/app', running(7000, 'nvim test', '/work/app'))).toBeUndefined();
  });

  it('refuses nothing outside a repository, for a process /proc hides, or without a process table', () => {
    expect(guard('pnpm test', '/home/someone/scratch', running(1, 'vitest', '/home/someone/scratch'))).toBeUndefined();
    expect(guard('pnpm test', '/work/app', running(1, 'vitest', null))).toBeUndefined();
    expect(testRunGuard('Bash', { command: 'pnpm test' }, '/work/app', { ...machineWith(), listProcesses: () => null })).toBeUndefined();
  });

  it('reads no process table for a call that starts no tests', () => {
    const listProcesses = () => {
      throw new Error('read');
    };
    expect(testRunGuard('Bash', { command: 'ls' }, '/work/app', { ...machineWith(), listProcesses })).toBeUndefined();
    expect(testRunGuard('Edit', { command: 'pnpm test' }, '/work/app', { ...machineWith(), listProcesses })).toBeUndefined();
  });
});
