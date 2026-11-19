import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import type { LogDraft } from '../../../shared/app/log-entry';
import { frozenInstall, worktreeMake } from './make';

// `files` are the paths that exist; an install of `failing` throws.
function maker(files: string[] = [], failing?: string) {
  const ran: string[] = [];
  const queued: string[] = [];
  const installed: string[] = [];
  const logged: LogDraft[] = [];
  const make = bind(worktreeMake, {
    exists: (path) => files.includes(path),
    async install(program, programArguments, cwd) {
      installed.push(`${[program, ...programArguments].join(' ')} in ${cwd}`);
      if (program === failing) throw new Error('ERR_PNPM_OUTDATED_LOCKFILE');
    },
    log: (draft) => logged.push(draft),
    async git(gitArguments) {
      ran.push(gitArguments.join(' '));
      return gitArguments[0] === 'for-each-ref' ? 'main\n' : '';
    },
    baseBranch: async () => 'main',
    newId: () => 'fresh-id',
    queue: (projectPath, run) => { queued.push(projectPath); return run(); },
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

  it('installs the packages from the lockfile once the worktree is added, the card kind and the again kind', async () => {
    const worktreePath = '/code/api.worktrees/fix';
    const { make, installed, logged } = maker([`${worktreePath}/pnpm-lock.yaml`, `${worktreePath}/.git`]);
    const made = await make.call({ kind: 'again', projectPath: '/code/api', worktreePath, branch: 'fix' });
    expect(installed).toEqual([`pnpm install --frozen-lockfile in ${worktreePath}`]);
    expect(made).toMatchObject({ output: expect.stringContaining('packages installed') });
    expect(logged).toEqual([]);
  });

  it('logs a failed install and keeps the worktree it made', async () => {
    const worktreePath = '/code/api.worktrees/fix';
    const { make, ran, logged } = maker([`${worktreePath}/pnpm-lock.yaml`, `${worktreePath}/.git`], 'pnpm');
    const made = await make.call({ kind: 'again', projectPath: '/code/api', worktreePath, branch: 'fix' });
    expect(made).toMatchObject({ worktreePath, output: expect.stringContaining('ERR_PNPM_OUTDATED_LOCKFILE') });
    expect(logged).toEqual([expect.objectContaining({ level: 'warn', kind: 'worktree', project: '/code/api' })]);
    expect(ran.filter((line) => line.startsWith('worktree remove'))).toEqual([]);
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
