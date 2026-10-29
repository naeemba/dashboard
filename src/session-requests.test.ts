import { describe, expect, it } from 'vitest';
import { projectOfFolder, sessionRequests, type SessionPorts } from './session-requests';

// One project, api, in slot 2, with main open and nothing else until a test opens a worker.
function project(overrides: Partial<SessionPorts> = {}) {
  const open = [0];
  const agents = new Set<string>(['2:0']);
  const started: { id: string; directory: string; args: string[]; cardId: string | null }[] = [];
  const closed: string[] = [];
  const marked: string[] = [];
  const removed: string[] = [];
  const ports: SessionPorts = {
    slotOf: (directory) => (directory.startsWith('/work/api') ? 2 : -1),
    projectPath: (slot) => (slot === 2 ? '/work/api' : undefined),
    openPanes: () => open,
    agentIn: (id) => agents.has(id),
    directoryOf: () => '/work/api',
    shellCommand: () => '/bin/zsh',
    openWorker: () => {
      const index = open.length;
      open.push(index);
      return index;
    },
    startWorker: (id, directory, args, cardId) => {
      agents.add(id);
      started.push({ id, directory, args, cardId });
    },
    closeWorker: (id) => {
      closed.push(id);
      agents.delete(id);
      open.splice(open.indexOf(Number(id.split(':')[1])), 1);
    },
    mark: (id, state) => { marked.push(`${id} ${state}`); },
    cardWorktree: (_projectPath, cardId) => ({
      'card-1': { worktreePath: '/work/api.worktrees/card-one', working: false },
      'card-3': { worktreePath: '/work/api.worktrees/card-three', working: true },
    })[cardId],
    makeWorktree: async () => '/work/api.worktrees/fix-the-tests',
    unfinished: async () => null,
    removeWorktree: async (worktreePath) => { removed.push(worktreePath); },
    ...overrides,
  };
  const ask = (args: string[], directory = '/work/api') => sessionRequests(ports)({ directory, args });
  return { ports, ask, open, started, closed, marked, removed };
}

describe('sessionRequests', () => {
  it('claims a fresh worker and answers with its id', async () => {
    const { ask, open } = project();
    expect(await ask(['claim'])).toEqual({ ok: true, output: '2:1' });
    expect(open).toEqual([0, 1]);
  });

  it('refuses a folder that is in no open project', async () => {
    expect(await project().ask(['claim'], '/elsewhere')).toMatchObject({ ok: false });
  });

  it('runs a worker in the project with its prompt as the argument', async () => {
    const { ports, started } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', 'research the cache'] }))
      .toEqual({ ok: true, output: 'started api-terminal-2 in 2:1, in /work/api' });
    expect(started[0]).toMatchObject({ id: '2:1', directory: '/work/api', cardId: null });
    expect(started[0].args[1]).toContain('research the cache');
  });

  it('runs a card task in the card\'s worktree, and refuses a card with none or one being worked', async () => {
    const { ports, started } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--card', 'card-1', 'work it'] });
    expect(started[0]).toMatchObject({ directory: '/work/api.worktrees/card-one', cardId: 'card-1' });
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--card', 'card-2', 'work it'] }))
      .toMatchObject({ ok: false, output: expect.stringContaining('has no worktree') });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--card', 'card-3', 'work it'] }))
      .toMatchObject({ ok: false, output: expect.stringContaining('already has an agent at work') });
  });

  // Main is where the asking happens; a worker already running is somebody's.
  it('never runs a worker in main, a closed pane or a pane already working', async () => {
    const { ports } = project();
    const answer = sessionRequests(ports);
    const run = (id: string) => answer({ directory: '/work/api', args: ['run', id, 'go'] });
    expect(await run('2:0')).toMatchObject({ ok: false, output: expect.stringContaining('main session') });
    expect(await run('2:4')).toMatchObject({ ok: false, output: expect.stringContaining('not open') });
    expect(await run('3:1')).toMatchObject({ ok: false, output: expect.stringContaining('not a pane of this project') });
    await answer({ directory: '/work/api', args: ['claim'] });
    await run('2:1');
    expect(await run('2:1')).toMatchObject({ ok: false, output: expect.stringContaining('already has a worker') });
  });

  it('removes a throwaway worktree on release once its work is out, and keeps it otherwise', async () => {
    const finished = project();
    const answer = sessionRequests(finished.ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] }))
      .toEqual({ ok: true, output: 'released 2:1 and removed fix-the-tests' });
    expect(finished.closed).toEqual(['2:1']);
    expect(finished.removed).toEqual(['/work/api.worktrees/fix-the-tests']);

    const unpushed = project({ unfinished: async () => 'its branch was never pushed' });
    const again = sessionRequests(unpushed.ports);
    await again({ directory: '/work/api', args: ['claim'] });
    await again({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    expect(await again({ directory: '/work/api', args: ['release', '2:1'] })).toEqual({
      ok: true, output: 'released 2:1; kept /work/api.worktrees/fix-the-tests: its branch was never pushed',
    });
    expect(unpushed.removed).toEqual([]);
  });

  // A hook reports from its worker's worktree, wherever that is; the id is all it needs.
  it('marks a worker from its hook and lists what it said', async () => {
    const { ports, marked } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    expect(await answer({ directory: '/anywhere', args: ['notify', '2:1', 'blocked'] })).toEqual({ ok: true, output: '' });
    expect(marked).toEqual(['2:1 blocked']);
    expect((await answer({ directory: '/work/api', args: ['list'] })).output.split('\n').map((line) => line.split('\t')[2]))
      .toEqual(['main', 'blocked', 'idle']);
    expect(await answer({ directory: '/work/api', args: ['notify', '2:7', 'done'] })).toMatchObject({ ok: false });
  });

  it('says a step failed rather than throwing', async () => {
    const { ports } = project({ makeWorktree: async () => { throw new Error('git said no'); } });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'go'] }))
      .toEqual({ ok: false, output: 'session run failed: git said no' });
  });
});

describe('projectOfFolder', () => {
  const projects = [undefined, '/work/api', '/work/web'];
  const asGiven = (path: string): string => path;

  it('finds the project from its checkout, anywhere inside it, or one of its worktrees', () => {
    expect(projectOfFolder(projects, '/work/api', asGiven)).toBe(1);
    expect(projectOfFolder(projects, '/work/api/src', asGiven)).toBe(1);
    expect(projectOfFolder(projects, '/work/api.worktrees/fix-it', asGiven)).toBe(1);
  });

  // `/work/api-old` starts with `/work/api` and is a different folder.
  it('does not take a folder that only starts with the project\'s name', () => {
    expect(projectOfFolder(projects, '/work/api-old', asGiven)).toBe(-1);
    expect(projectOfFolder(projects, '/elsewhere', asGiven)).toBe(-1);
  });

  // ~/work is a symlink to /mnt/data, and the command reports the folder it really is in.
  it('finds a project opened through a symlink', () => {
    const real = (path: string): string => path.replace('/work/', '/mnt/data/');
    expect(projectOfFolder(projects, '/mnt/data/api', real)).toBe(1);
    expect(projectOfFolder(projects, '/mnt/data/api.worktrees/fix-it', real)).toBe(1);
  });
});
