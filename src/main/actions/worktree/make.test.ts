import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import type { LogDraft } from '../../../shared/app/log-entry';
import { frozenInstall, installFailure, worktreeMake } from './make';

// An error shaped like execFile's for a failed pnpm: the reason on stdout, the message only stderr's.
const PNPM_FAILURE = Object.assign(new Error('Command failed: pnpm install --frozen-lockfile\n(node) [DEP0169] DeprecationWarning'), {
  stdout: 'ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"',
  stderr: '(node) [DEP0169] DeprecationWarning',
});

// `files` are the paths that exist; an install of `failing` throws. Each install is noted with whether
// the queue was held while it ran.
function maker(files: string[] = [], failing?: string) {
  const ran: string[] = [];
  const queued: string[] = [];
  const installed: string[] = [];
  const logged: LogDraft[] = [];
  let queueHeld = false;
  const make = bind(worktreeMake, {
    exists: (path) => files.includes(path),
    async install(program, programArguments, cwd) {
      installed.push(`${[program, ...programArguments].join(' ')} in ${cwd}${queueHeld ? ', queue held' : ''}`);
      if (program === failing) throw PNPM_FAILURE;
    },
    log: (draft) => logged.push(draft),
    async git(gitArguments) {
      ran.push(gitArguments.join(' '));
      return gitArguments[0] === 'for-each-ref' ? 'main\n' : '';
    },
    baseBranch: async () => 'main',
    newId: () => 'fresh-id',
    async queue(projectPath, run) {
      queued.push(projectPath);
      queueHeld = true;
      try { return await run(); } finally { queueHeld = false; }
    },
  });
  return { make, ran, queued, installed, logged };
}

describe('worktree.make', () => {
  it('makes a card branch off the base the ship fetched, inside the queue the ship holds', async () => {
    const { make, ran, queued } = maker();
    const made = await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: 'main' });
    expect(made).toMatchObject({ branch: expect.stringContaining('fix-login') });
    expect(queued).toEqual([]);
    expect(ran.filter((line) => line.startsWith('fetch'))).toEqual([]);
    expect(ran.at(-1)).toMatch(/^worktree add -b \S*fix-login\S* \S+ origin\/main$/);
  });

  it('takes the queue and fetches for a throwaway, which nothing else holds it for', async () => {
    const { make, ran, queued } = maker();
    await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(queued).toEqual(['/code/api']);
    expect(ran[0]).toBe('fetch origin main');
  });

  it('checks a reviewed card branch out again at its own path, with no new branch', async () => {
    const { make, ran, queued } = maker();
    await make.call({ kind: 'again', projectPath: '/code/api', worktreePath: '/code/api.worktrees/fix', branch: 'fix' });
    expect(ran).toEqual(['worktree add /code/api.worktrees/fix fix']);
    expect(queued).toEqual([]);
  });

  it('installs the packages from the lockfile once the worktree is added, for every kind', async () => {
    const worktreePath = '/code/api.worktrees/fix';
    const { make, installed, logged } = maker([`${worktreePath}/pnpm-lock.yaml`, `${worktreePath}/.git`]);
    await make.call({ kind: 'again', projectPath: '/code/api', worktreePath, branch: 'fix' });
    expect(installed).toEqual([`pnpm install --frozen-lockfile in ${worktreePath}`]);
    expect(logged).toEqual([]);
  });

  it('installs in a new branch\'s worktree, the throwaway\'s inside the queue it takes', async () => {
    const lockfiles = ['fix-login', 'try-a-thing'].flatMap((name) => [`/code/api.worktrees/${name}/pnpm-lock.yaml`, `/code/api.worktrees/${name}/.git`]);
    const { make, installed } = maker(lockfiles);
    await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: 'main' });
    await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(installed).toEqual([
      expect.stringMatching(/^pnpm install --frozen-lockfile in \S*fix-login\S*$/),
      expect.stringMatching(/^pnpm install --frozen-lockfile in \S*try-a-thing\S*, queue held$/),
    ]);
  });

  it('logs a failed install with the reason pnpm gave, and keeps the worktree it made', async () => {
    const worktreePath = '/code/api.worktrees/fix';
    const { make, ran, logged } = maker([`${worktreePath}/pnpm-lock.yaml`, `${worktreePath}/.git`], 'pnpm');
    expect(await make.call({ kind: 'again', projectPath: '/code/api', worktreePath, branch: 'fix' })).toMatchObject({ worktreePath });
    expect(logged).toEqual([expect.objectContaining({ level: 'warn', kind: 'worktree', project: '/code/api', message: expect.stringContaining('ERR_PNPM_OUTDATED_LOCKFILE') })]);
    expect(ran.filter((line) => line.startsWith('worktree remove'))).toEqual([]);
  });

  it('reads an install failure from both streams, or from the error when it has none', () => {
    expect(installFailure(PNPM_FAILURE)).toMatch(/^ERR_PNPM_OUTDATED_LOCKFILE.*\n\(node\) \[DEP0169\]/);
    expect(installFailure(Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }))).toContain('spawn pnpm ENOENT');
  });

  it('installs nothing in a worktree with no lockfile', async () => {
    const { make, installed } = maker();
    await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: 'main' });
    expect(installed).toEqual([]);
  });

  it('picks the frozen install by the lockfile', () => {
    const lockfile = (name: string) => (path: string) => path === `/w/${name}` || path === '/w/.git';
    expect(frozenInstall('/w', lockfile('package-lock.json'))).toEqual(['npm', 'ci']);
    expect(frozenInstall('/w', lockfile('yarn.lock'))).toEqual(['yarn', 'install', '--frozen-lockfile']);
    expect(frozenInstall('/w', lockfile('bun.lock'))).toEqual(['bun', 'install', '--frozen-lockfile']);
  });

  it('refuses a make it cannot read', async () => {
    const { make, ran } = maker();
    expect(await make.call({ kind: 'card', projectPath: '/code/api', title: 'no id' })).toHaveProperty('refused');
    expect(ran).toEqual([]);
  });
});
