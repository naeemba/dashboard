import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runningProcess } from './running-app-guard';
import { runsTests, testRunFolders, testRunGuard } from './test-run-guard';

// The guard joins with the platform's separator, so on Windows it asks for `\work\app\.git`, and a
// folder a `cd` resolved carries a drive letter.
const files = (...paths: string[]) => (path: string) => paths.includes(path.replaceAll('\\', '/').replace(/^[A-Za-z]:/, ''));
const repositories = files('/work/app/.git', '/work/app.worktrees/card/.git', '/work/app/.adopt-docs/.git');
type Running = { process: ReturnType<typeof runningProcess>; folder: string | null };
const running = (pid: number, commandLine: string, folder: string | null): Running => ({ process: runningProcess(pid, 'node', commandLine.split(' ')), folder });
const machineWith = (...processes: Running[]) => ({
  listProcesses: () => processes.map((each) => each.process),
  workingFolder: (pid: number) => processes.find((each) => each.process.pid === pid)?.folder ?? null,
  exists: repositories,
});
const reason = (answer: ReturnType<typeof testRunGuard>) => answer?.hookSpecificOutput.permissionDecisionReason;

describe('testRunFolders', () => {
  const startsTestRun = (command: string) => testRunFolders(command, '/work/app').length > 0;

  it.each([
    'pnpm test',
    'pnpm check',
    'npm test',
    'npm t',
    'npm run test:unit',
    'npm run-script test',
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

  it('follows a cd earlier in the line, into an sh -c body too', () => {
    const fromCheckout = (command: string) => testRunFolders(command, '/work/app').map((folder) => folder.replaceAll('\\', '/'));
    expect(fromCheckout('cd ../app.worktrees/card && pnpm test')).toEqual([expect.stringMatching(/\/work\/app\.worktrees\/card$/)]);
    expect(fromCheckout("cd packages/core && sh -c 'pnpm test'")).toEqual([expect.stringMatching(/\/work\/app\/packages\/core$/)]);
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

  it('judges a run where a cd earlier in the line moved to', () => {
    expect(reason(guard('cd ../app.worktrees/card && pnpm test', '/work/app', running(8000, 'vitest run', resolve('/work/app.worktrees/card'))))).toContain('pid 8000');
    expect(guard('cd ../app.worktrees/card && pnpm test', '/work/app', vitest)).toBeUndefined();
  });

  it('cuts a long command line in the refusal', () => {
    const long = running(9000, `vitest run ${'x'.repeat(200)}`, '/work/app');
    const answer = reason(guard('pnpm test', '/work/app', long)) ?? '';
    expect(answer).toContain(`pid 9000: vitest run ${'x'.repeat(149)}…)`);
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
