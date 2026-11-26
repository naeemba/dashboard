import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import type { LogDraft } from '../../../shared/app/log-entry';
import { frozenInstall, installFailure, worktreeMake } from './make';

// An error shaped like execFile's for a failed pnpm: the reason on stdout, the message only stderr's.
const PNPM_FAILURE = Object.assign(new Error('Command failed: pnpm install --frozen-lockfile\n(node) [DEP0169] DeprecationWarning'), {
  stdout: 'ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"',
  stderr: '(node) [DEP0169] DeprecationWarning',
});

// `files` are the paths that exist, read with `/` since the lockfile lookup joins with the platform's
// separator and on Windows asks for `\code\api.worktrees\fix\.git`; an install of `failing` throws. Each install is noted with whether
// the queue was held while it ran. The first `fetchFailures` fetches fail as a lost SSH key does.
function maker(files: string[] = [], failing?: string, fetchFailures = 0) {
  let fetchesLeftToFail = fetchFailures;
  const ran: string[] = [];
  const queued: string[] = [];
  const installed: string[] = [];
  const logged: LogDraft[] = [];
  let queueHeld = false;
  const make = bind(worktreeMake, {
    exists: (path) => files.includes(path.replaceAll('\\', '/')),
    async install(program, programArguments, cwd) {
      installed.push(`${[program, ...programArguments].join(' ')} in ${cwd}${queueHeld ? ', queue held' : ''}`);
      if (program === failing) throw PNPM_FAILURE;
    },
    log: (draft) => logged.push(draft),
    async git(gitArguments) {
      ran.push(gitArguments.join(' '));
      if (gitArguments[0] === 'fetch' && fetchesLeftToFail-- > 0) throw new Error('Permission denied (publickey).');
      return gitArguments[0] === 'for-each-ref' ? 'main\n' : '';
    },
    baseBranch: async () => ({ remote: 'gitlab', branch: 'develop' }),
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
    const made = await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: { remote: 'origin', branch: 'main' } });
    expect(made).toMatchObject({ branch: expect.stringContaining('fix-login') });
    expect(queued).toEqual([]);
    expect(ran.filter((line) => line.startsWith('fetch'))).toEqual([]);
    expect(ran.at(-1)).toMatch(/^worktree add -b \S*fix-login\S* \S+ origin\/main$/);
  });

  // The base's own remote, which is not always origin (chosenRemote).
  it('takes the queue and fetches for a throwaway, which nothing else holds it for', async () => {
    const { make, ran, queued } = maker();
    await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(queued).toEqual(['/code/api']);
    expect(ran[0]).toBe('fetch gitlab develop');
    expect(ran.at(-1)).toMatch(/^worktree add -b \S*try-a-thing\S* \S+ gitlab\/develop$/);
  });

  it('fetches a throwaway\'s base once more when the first fetch fails, and says nothing', async () => {
    const { make, ran, logged } = maker([], undefined, 1);
    const made = await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(ran.slice(0, 2)).toEqual(['fetch gitlab develop', 'fetch gitlab develop']);
    expect(made).not.toHaveProperty('warning');
    expect(logged).toEqual([]);
  });

  it('cuts a throwaway from the last fetched base when both fetches fail, warning it may be stale', async () => {
    const { make, ran, logged } = maker([], undefined, 2);
    const made = await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(ran.at(-1)).toMatch(/^worktree add -b \S*try-a-thing\S* \S+ gitlab\/develop$/);
    expect(made).toMatchObject({ warning: expect.stringMatching(/gitlab\/develop as last fetched and may be stale: .*publickey/) });
    expect(logged).toEqual([expect.objectContaining({ level: 'warn', kind: 'worktree', message: expect.stringContaining('may be stale') })]);
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
    await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: { remote: 'origin', branch: 'main' } });
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
    const npmHelp = Array.from({ length: 90 }, (_, index) => `npm error   --option-${index}`).join('\n');
    const npmFailure = Object.assign(new Error('Command failed: npm ci'), {
      stdout: '',
      stderr: `npm warn old lockfile\nnpm error code EUSAGE\nnpm error \`npm ci\` can only install packages when your package.json and package-lock.json are in sync\nnpm error Missing: is-number@7.0.0 from lock file\n${npmHelp}\nnpm error Run "npm help ci" for more info`,
    });
    expect(installFailure(npmFailure)).toMatch(/^npm error code EUSAGE\n.*in sync\nnpm error Missing: is-number/);
    expect(installFailure(Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }))).toContain('spawn pnpm ENOENT');
  });

  // yarn berry names no error in a line the pattern reads: its reason is only near the bottom.
  it('keeps the last ten lines of an install that names no error', () => {
    const progress = Array.from({ length: 12 }, (_, index) => `➤ YN0000: step ${index}`).join('\n');
    const yarnFailure = Object.assign(new Error('Command failed: yarn install --frozen-lockfile'), {
      stdout: `${progress}\n➤ YN0028: The lockfile would have been modified by this install, which is explicitly forbidden.\n➤ YN0000: · Failed with errors`,
      stderr: '',
    });
    const reason = installFailure(yarnFailure);
    expect(reason).toContain('YN0028');
    expect(reason).not.toContain('step 0\n');
    expect(reason.split('\n')).toHaveLength(10);
  });

  // A slow cold install stopped at the limit prints only warnings; they are not why it stopped.
  it('says an install was stopped at the time limit', () => {
    const killed = Object.assign(new Error('Command failed: npm ci'), { killed: true, signal: 'SIGTERM', stdout: '', stderr: 'npm warn deprecated inflight@1.0.6' });
    expect(installFailure(killed)).toBe('stopped after 5 minutes: npm warn deprecated inflight@1.0.6');
    expect(installFailure(Object.assign(new Error('Command failed: npm ci'), { killed: true, stdout: '', stderr: '' }))).toBe('stopped after 5 minutes');
  });

  it('installs nothing in a worktree with no lockfile', async () => {
    const { make, installed } = maker();
    await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: { remote: 'origin', branch: 'main' } });
    expect(installed).toEqual([]);
  });

  it('picks the frozen install by the lockfile', () => {
    const lockfile = (name: string) => (path: string) => [`/w/${name}`, '/w/.git'].includes(path.replaceAll('\\', '/'));
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
