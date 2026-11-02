import { describe, expect, it } from 'vitest';
import { doneReport, projectOfFolder, sessionRequests, type SessionPorts } from './session-requests';

const SESSION = 'ccaaf965-c864-48db-8044-30bf27d93087';

// One project, api, in slot 2, with main open and nothing else until a test opens a worker.
function project(overrides: Partial<SessionPorts> = {}) {
  const open = [0];
  const agents = new Set<string>(['2:0']);
  // Main's record of its workers, which main.ts keeps: added by a run, gone with the agent or the pane.
  const workers = new Set<string>();
  const started: { id: string; directory: string; agentArguments: string[]; cardId: string | null }[] = [];
  const closed: string[] = [];
  const marked: string[] = [];
  const removed: string[] = [];
  const told: string[] = [];
  const ports: SessionPorts = {
    slotOf: (directory) => (directory.startsWith('/work/api') ? 2 : -1),
    projectPath: (slot) => (slot === 2 ? '/work/api' : undefined),
    openSlots: () => [{ slot: 2, name: 'api' }],
    findProject: (word) => ({ ok: false, message: `no project is called ${word}` }),
    folderExists: () => true,
    openProject: () => 2,
    openPanes: () => open,
    agentIn: (id) => agents.has(id),
    busyWith: (id) => (agents.has(id) ? 'an agent' : null),
    directoryOf: () => '/work/api',
    mainsWorkerIn: (id) => workers.has(id),
    shellCommand: () => '/bin/zsh',
    openWorker: () => {
      const index = open.length;
      open.push(index);
      return index;
    },
    newSession: () => SESSION,
    startWorker: (id, directory, agentArguments, cardId) => {
      agents.add(id);
      workers.add(id);
      started.push({ id, directory, agentArguments, cardId });
    },
    closeWorker: (id) => {
      closed.push(id);
      agents.delete(id);
      workers.delete(id);
      open.splice(open.indexOf(Number(id.split(':')[1])), 1);
    },
    mark: (id, state) => { marked.push(`${id} ${state}`); },
    tell: (slot, text) => { told.push(`${slot} ${text}`); },
    cardWorktree: (_projectPath, cardId) => ({
      'card-1': { worktreePath: '/work/api.worktrees/card-one', working: false },
      'card-3': { worktreePath: '/work/api.worktrees/card-three', working: true },
    })[cardId],
    makeWorktree: async () => '/work/api.worktrees/fix-the-tests',
    unfinished: async () => null,
    removeWorktree: async (worktreePath, projectPath) => { removed.push(`${worktreePath} from ${projectPath}`); },
    ...overrides,
  };
  const ask = (commandArguments: string[], directory = '/work/api') => sessionRequests(ports)({ directory, args: commandArguments });
  return { ports, ask, open, agents, workers, started, closed, marked, removed, told };
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
      .toEqual({ ok: true, output: 'started api-terminal-2 in 2:1, in /work/api dashboard://pane/2:1' });
    expect(started[0]).toMatchObject({ id: '2:1', directory: '/work/api', cardId: null });
    expect(started[0].agentArguments[1]).toContain('research the cache');
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
    expect(finished.removed).toEqual(['/work/api.worktrees/fix-the-tests from /work/api']);

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
    expect(marked).toEqual(['2:1 running', '2:1 blocked']);
    expect((await answer({ directory: '/work/api', args: ['list'] })).output.split('\n').map((line) => line.split('\t')[2]))
      .toEqual(['main', 'blocked', 'idle']);
    expect(await answer({ directory: '/work/api', args: ['notify', '2:7', 'done'] })).toMatchObject({ ok: false });
  });

  it('lists the workers main ran, with what each was asked and how it stands, until released', async () => {
    const { ports, agents, workers } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(answer.workers()).toEqual([]);
    await answer({ directory: '/work/api', args: ['run', '2:1', 'research the cache'] });
    expect(answer.workers()).toEqual([
      { id: '2:1', dispatcher: 2, project: 'api', name: 'api-terminal-2', about: 'research the cache', status: 'working' },
    ]);
    await answer({ directory: '/anywhere', args: ['notify', '2:1', 'done'] });
    expect(answer.workers()[0].status).toBe('done');
    // The agent exited: the pane is a shell again.
    agents.delete('2:1');
    workers.delete('2:1');
    expect(answer.workers()[0].status).toBe('idle');
    await answer({ directory: '/work/api', args: ['release', '2:1'] });
    expect(answer.workers()).toEqual([]);
  });

  // Pane numbers are reused, so the record goes with the pane: closed by hand and claimed again, or
  // forgotten when main closes it or starts something else there, the number is nobody's worker.
  it('drops a worker from the list once its pane is claimed again or forgotten', async () => {
    const { ports } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'research the cache'] });
    ports.closeWorker('2:1');
    expect(await answer({ directory: '/work/api', args: ['claim'] })).toEqual({ ok: true, output: '2:1' });
    expect(answer.workers()).toEqual([]);
    await answer({ directory: '/work/api', args: ['run', '2:1', 'research the cache'] });
    answer.forget('2:1');
    expect(answer.workers()).toEqual([]);
  });

  // A worker resumed at launch has no run behind it, so its own page's main hears it.
  it('tells the pane\'s own main when a resumed worker no run started is done', async () => {
    const { ports, open, agents, workers, told } = project();
    open.push(1);
    agents.add('2:1');
    workers.add('2:1');
    const answer = sessionRequests(ports);
    await answer({ directory: '/anywhere', args: ['notify', '2:1', 'done'] });
    expect(told).toEqual([`2 ${doneReport('api-terminal-2', '2:1')}`]);
  });

  it('tells main when a worker it started is done, and not when anything else in a pane is', async () => {
    const { ports, agents, told } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    await answer({ directory: '/anywhere', args: ['notify', '2:1', 'blocked'] });
    expect(told).toEqual([]);
    await answer({ directory: '/anywhere', args: ['notify', '2:1', 'done'] });
    expect(told).toEqual([`2 ${doneReport('api-terminal-2', '2:1')}`]);
    // A Claude opened by hand in the other pane runs the same hooks only if somebody gave it them; its
    // done is still nobody's report to main.
    agents.add('2:2');
    await answer({ directory: '/anywhere', args: ['notify', '2:2', 'done'] });
    expect(told).toHaveLength(1);
  });

  // A follow-up typed into a finished worker, or a permission answered, puts it back to work.
  it('lists a worker as running again once its hooks say so', async () => {
    const { ports } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    const stateOfWorker = async () => (await answer({ directory: '/work/api', args: ['list'] })).output.split('\n')[1].split('\t')[2];
    await answer({ directory: '/work/api', args: ['notify', '2:1', 'blocked'] });
    expect(await stateOfWorker()).toBe('blocked');
    await answer({ directory: '/work/api', args: ['notify', '2:1', 'running'] });
    expect(await stateOfWorker()).toBe('running');
  });

  // A dev server started by hand in a worker, or a card's agent a ship started: neither is main's to kill.
  it('runs in and releases only a pane nobody else is using', async () => {
    const programs = new Map([['2:1', 'npm'], ['2:2', 'an agent']]);
    const { ports, closed, started } = project({ busyWith: (id) => programs.get(id) ?? null });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] }))
      .toEqual({ ok: false, output: '2:1 is running npm — claim another' });
    expect(started).toEqual([]);
    expect(await answer({ directory: '/work/api', args: ['release', '2:2'] }))
      .toMatchObject({ ok: false, output: expect.stringContaining('which no session run started') });
    expect(closed).toEqual([]);
    expect((await answer({ directory: '/work/api', args: ['list'] })).output.split('\n')[1].split('\t')[2]).toBe('busy npm');
  });

  // Main's worker finished and its Claude Code exited; a dev server you then started in that shell is yours.
  it('refuses to release a pane whose worker has gone and that now runs something else', async () => {
    const { ports, closed } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    ports.agentIn = () => false;
    ports.busyWith = () => 'npm';
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] }))
      .toMatchObject({ ok: false, output: expect.stringContaining('which no session run started') });
    expect(closed).toEqual([]);
  });

  // Main's worker exited and a ship then started card Y's agent in that pane: main's record went with
  // the worker, so the agent is Y's and release leaves it alone.
  it('refuses to release a pane whose worker has gone and that now holds another agent', async () => {
    const { ports, workers, closed } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    workers.delete('2:1');
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] }))
      .toMatchObject({ ok: false, output: expect.stringContaining('which no session run started') });
    expect(closed).toEqual([]);
  });

  // After a restart main resumes as its worker only a pane that held one when the app quit. A card's
  // agent a ship started, and a conversation typed back into a shell, are somebody else's.
  it('releases a worker resumed at launch, and nothing else resumed beside it', async () => {
    const programs = new Map([['2:1', 'claude'], ['2:2', 'an agent'], ['2:3', 'an agent']]);
    const { ports, open, agents, workers, closed } = project({ busyWith: (id) => programs.get(id) ?? null });
    open.push(1, 2, 3);
    agents.add('2:2');
    agents.add('2:3');
    workers.add('2:2');
    const answer = sessionRequests(ports);
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] })).toMatchObject({ ok: false });
    expect(await answer({ directory: '/work/api', args: ['release', '2:2'] })).toEqual({ ok: true, output: 'released 2:2' });
    expect(await answer({ directory: '/work/api', args: ['release', '2:3'] })).toMatchObject({ ok: false });
    expect(closed).toEqual(['2:2']);
  });

  // The first worker has exited, so the pane is free; a second throwaway would make release forget it.
  it('refuses a second throwaway worktree in a pane that still holds one', async () => {
    const { ports, started } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    ports.agentIn = () => false;
    ports.busyWith = () => null;
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'again'] })).toEqual({
      ok: false, output: '2:1 still holds /work/api.worktrees/fix-the-tests — release it first',
    });
    expect(started).toHaveLength(1);
  });

  it('says a step failed rather than throwing', async () => {
    const { ports } = project({ makeWorktree: async () => { throw new Error('git said no'); } });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'go'] }))
      .toEqual({ ok: false, output: 'session run failed: git said no' });
  });

  // The manager's terminals sit in slot -2, so every id it is handed starts with a minus sign.
  it('claims, runs, notifies and releases through the manager\'s negative slot', async () => {
    const { ports, started, marked, closed } = project({
      slotOf: (directory) => (directory === '/home/me/.dashboard' ? -2 : -1),
      projectPath: (slot) => (slot === -2 ? '/home/me/.dashboard' : undefined),
    });
    const answer = sessionRequests(ports);
    const ask = (words: string[]) => answer({ directory: '/home/me/.dashboard', args: words });
    expect(await ask(['claim'])).toEqual({ ok: true, output: '-2:1' });
    expect(await ask(['run', '-2:1', 'review it'])).toMatchObject({ ok: true });
    expect(started[0]).toMatchObject({ id: '-2:1', directory: '/home/me/.dashboard' });
    expect(await ask(['notify', '-2:1', 'done'])).toEqual({ ok: true, output: '' });
    expect(marked).toEqual(['-2:1 running', '-2:1 done']);
    expect(await ask(['release', '-2:1'])).toEqual({ ok: true, output: 'released -2:1' });
    expect(closed).toEqual(['-2:1']);
  });
});

// The manager in slot -2 asking about two projects: api open in slot 2, shop closed until a claim
// opens it into slot 3. Each page has only its main until a worker is claimed on it.
function pages() {
  const paths = new Map<number, string>([[-2, '/work/desk'], [2, '/work/api']]);
  const panes = new Map<number, number[]>([[-2, [0]], [2, [0]]]);
  const started: { id: string; directory: string; agentArguments: string[] }[] = [];
  const opened: string[] = [];
  const working = new Set<string>();
  const known: Record<string, string> = { api: '/work/api', shop: '/work/shop', gone: '/work/gone' };
  const { ports, told } = project({
    slotOf: (directory) => [...paths].find(([, folder]) => directory.startsWith(folder))?.[0] ?? -1,
    projectPath: (slot) => paths.get(slot),
    openSlots: () => [...paths].map(([slot, folder]) => ({ slot, name: folder.split('/')[2] })),
    findProject: (word) => (known[word] ? { ok: true, name: word, path: known[word] } : { ok: false, message: `no project is called ${word}` }),
    folderExists: (folder) => folder !== '/work/gone',
    openProject: (folder) => {
      const open = [...paths].find(([, each]) => each === folder);
      if (open) return open[0];
      opened.push(folder);
      paths.set(3, folder);
      panes.set(3, [0]);
      return 3;
    },
    openPanes: (slot) => panes.get(slot) ?? [],
    openWorker: (slot) => {
      const open = panes.get(slot) ?? [];
      open.push(open.length);
      return open.length - 1;
    },
    directoryOf: (id) => paths.get(Number(id.split(':')[0])),
    newSession: () => SESSION,
    agentIn: (id) => working.has(id),
    mainsWorkerIn: (id) => working.has(id),
    startWorker: (id, directory, agentArguments) => {
      working.add(id);
      started.push({ id, directory, agentArguments });
    },
    closeWorker: (id) => {
      const [slot, index] = id.split(':').map(Number);
      panes.set(slot, (panes.get(slot) ?? []).filter((each) => each !== index));
      working.delete(id);
    },
  });
  const answer = sessionRequests(ports);
  const ask = (words: string[], directory = '/work/desk') => answer({ directory, args: words });
  return { ask, answer, ports, started, opened, told };
}

describe('sessionRequests across projects', () => {
  it('claims a pane on a project already open, and runs it there reporting to the asker\'s main', async () => {
    const { ask, started, opened } = pages();
    expect(await ask(['claim', '--project', 'api'])).toEqual({ ok: true, output: '2:1' });
    expect(opened).toEqual([]);
    expect(await ask(['run', '2:1', 'fix the tests'])).toEqual({ ok: true, output: 'started api-terminal-2 in 2:1, in /work/api dashboard://pane/2:1' });
    expect(started[0]).toMatchObject({ id: '2:1', directory: '/work/api' });
    expect(started[0].agentArguments[1]).toContain('SendMessage to main-desk when done');
    expect(await ask(['release', '2:1'])).toEqual({ ok: true, output: 'released 2:1' });
    expect(await ask(['release', '2:1'])).toMatchObject({ ok: false });
  });

  it('tells the main that claimed a pane on another page when its worker is done', async () => {
    const { ask, told } = pages();
    await ask(['claim', '--project', 'api']);
    await ask(['run', '2:1', 'fix the tests']);
    await ask(['notify', '2:1', 'done'], '/anywhere');
    expect(told).toEqual([`-2 ${doneReport('api-terminal-2', '2:1')}`]);
  });

  it('lists a worker claimed on another page under the main that ran it', async () => {
    const { ask, answer } = pages();
    await ask(['claim', '--project', 'api']);
    await ask(['run', '2:1', 'fix the tests']);
    expect(answer.workers()).toMatchObject([{ id: '2:1', dispatcher: -2, project: 'api', name: 'api-terminal-2' }]);
  });

  it('opens a closed project before claiming a pane on its page', async () => {
    const { ask, opened } = pages();
    expect(await ask(['claim', '--project', 'shop'])).toEqual({ ok: true, output: '3:1' });
    expect(opened).toEqual(['/work/shop']);
  });

  it('refuses a name projects.yaml does not give, and a project whose folder is gone', async () => {
    const { ask } = pages();
    expect(await ask(['claim', '--project', 'zzz'])).toEqual({ ok: false, output: 'no project is called zzz' });
    expect(await ask(['claim', '--project', 'gone'])).toEqual({ ok: false, output: 'gone is at /work/gone, which is not a folder' });
  });

  it('keeps a pane another project claimed out of reach of every other asker', async () => {
    const { ask } = pages();
    await ask(['claim', '--project', 'shop']);
    expect(await ask(['run', '3:1', 'go'], '/work/api')).toEqual({ ok: false, output: '3:1 is not a pane of this project' });
    // The project's own main may still use a pane on its own page.
    expect(await ask(['run', '3:1', 'go'], '/work/shop')).toMatchObject({ ok: true });
  });

  it('forgets who claimed a pane once its number is claimed again on its own page', async () => {
    const { ask, ports } = pages();
    await ask(['claim', '--project', 'api']);
    // Closed by hand, not released: the number is free and the api's own claim takes it.
    ports.closeWorker('2:1');
    expect(await ask(['claim'], '/work/api')).toEqual({ ok: true, output: '2:1' });
    expect(await ask(['run', '2:1', 'go'])).toEqual({ ok: false, output: '2:1 is not a pane of this project' });
  });

  it('lists every open page\'s panes with --all, each line led by its project', async () => {
    const { ask } = pages();
    await ask(['claim', '--project', 'api']);
    expect((await ask(['list', '--all'])).output).toBe([
      'desk\t-2:0\tmain\tmain\t/work/desk',
      'api\t2:0\tmain\tmain\t/work/api',
      'api\t2:1\tterminal 2\tidle\t/work/api',
    ].join('\n'));
    expect((await ask(['list'])).output).toBe('-2:0\tmain\tmain\t/work/desk');
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
