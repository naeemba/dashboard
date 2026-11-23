import { describe, expect, it } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';

// `pane run --worktree`: the throwaway a pane is given, and every way it is let go of.

describe('session throwaways', () => {
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

  // A pane closed by hand or with its project never goes through release, and left its throwaway on disk.
  it('lets go of a throwaway when its pane goes without a release, and only once', async () => {
    const { ports, removed, released } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    await answer.dropped('2:1');
    await answer.dropped('2:1');
    expect(removed).toEqual(['/work/api.worktrees/fix-the-tests from /work/api']);
    expect(released).toEqual(['2:1 dropped: removed fix-the-tests (/work/api)']);
  });

  // pane.close drops the pane in the middle of a release, which lets go of the throwaway and answers for it.
  it('leaves a released pane\'s throwaway to the release', async () => {
    const { ports, removed, released } = project();
    const { close } = ports;
    ports.close = async (id) => {
      await answer.dropped(id);
      return close(id);
    };
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] }))
      .toEqual({ ok: true, output: 'released 2:1 and removed fix-the-tests' });
    expect(removed).toEqual(['/work/api.worktrees/fix-the-tests from /work/api']);
    expect(released).toEqual([]);
  });

  // After a restart nothing remembers which pane a throwaway was given to: the launch's sweep asks.
  it('gives a throwaway found at launch to the pane standing in it, whose close then lets go of it', async () => {
    const { ports, open, removed } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api.worktrees/old/src' : '/work/api') });
    open.push(1);
    const answer = sessionRequests(ports);
    expect(answer.hold({ worktreePath: '/work/api.worktrees/old', projectPath: '/work/api' })).toBe('2:1');
    expect(answer.hold({ worktreePath: '/work/api.worktrees/other', projectPath: '/work/api' })).toBeUndefined();
    await answer.dropped('2:1');
    expect(removed).toEqual(['/work/api.worktrees/old from /work/api']);
  });

  // git lists a throwaway by its real path; a project opened through a symlink keeps the link's.
  it('finds the pane in a throwaway listed by its real path', () => {
    const { ports, open } = project({
      directoryOf: (id) => (id === '2:1' ? '/link/api.worktrees/old' : '/link/api'),
      realPath: (folder) => folder.replace(/^\/link\//, '/work/'),
    });
    open.push(1);
    expect(sessionRequests(ports).hold({ worktreePath: '/work/api.worktrees/old', projectPath: '/work/api' })).toBe('2:1');
  });

  // A page reload restores again, and a plain run since may have moved the pane's worker elsewhere.
  it('answers the pane already holding a throwaway, wherever its worker runs now', async () => {
    const { ports } = project({ directoryOf: () => '/work/api' });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] });
    expect(answer.hold({ worktreePath: '/work/api.worktrees/fix-the-tests', projectPath: '/work/api' })).toBe('2:1');
  });

  // The mark only lets a restart's sweep find the folder; the worker it was made for starts anyway.
  it('starts a throwaway\'s worker when marking it fails, and says so', async () => {
    const { ports, started } = project({ markThrowaway: async () => { throw new Error('disk full'); } });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect((await answer({ directory: '/work/api', args: ['run', '2:1', '--worktree', 'fix the tests'] })).output)
      .toContain('(not marked a throwaway, so a restart will not sweep it: disk full)');
    expect(started.map(({ id }) => id)).toEqual(['2:1']);
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
});
