import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRequests } from './session-requests';
import { project } from './session-requests-fixture';

// `pane run --in <folder>`: a worker in a folder the caller keeps, and the worktree it is in.

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// --in goes through path.resolve, which on Windows puts a drive on the fixture's POSIX folders.
import { posixPathsOnly } from '../testing/posix-paths-only';

describe('sessionRequests run --in', () => {
  // The caller's own worktree, typed from main's folder: the worker starts there, and release closes the
  // pane and leaves the folder, which no run made.
  posixPathsOnly('runs a worker in a folder named with --in and leaves the folder on release', async () => {
    const { ports, started, removed } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', '--in', '../api-mr174', 'review it'] }))
      .toMatchObject({ ok: true, output: expect.stringContaining('in /work/api-mr174') });
    expect(started).toMatchObject([{ id: '2:1', directory: '/work/api-mr174', cardId: null }]);
    expect(await answer({ directory: '/work/api', args: ['release', '2:1'] })).toEqual({ ok: true, output: 'released 2:1' });
    expect(removed).toEqual([]);
  });

  // The checkout's own branch is anybody's, so a worker standing in a folder inside it is not finished by
  // that branch's merged pull request.
  it('does not finish a worker in a folder inside the checkout on the checkout\'s merged branch', async () => {
    const { ports } = project({ directoryOf: () => '/work/api/packages/web', merged: async () => true });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    expect(await answer({ directory: '/work/api', args: ['finish', '2:1'] })).toMatchObject({ ok: false });
  });

  // Where the --worktree flag of Claude Code puts its worktrees: inside the checkout, on a branch of its own.
  it('finishes a worker run --in a worktree nested in the checkout once its branch merged', async () => {
    const { ports } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api/.claude/worktrees/x' : '/work/api'), merged: async () => true });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--in', '.claude/worktrees/x', 'go'] });
    expect(await answer({ directory: '/work/api', args: ['finish', '2:1'] })).toEqual({ ok: true, output: 'released 2:1' });
  });

  // A worker resumed at launch comes back through pane.dispatch, never through run: its folder alone says
  // which worktree it is in.
  it('finishes a resumed worker in a worktree nested in the checkout once its branch merged', async () => {
    const { ports } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api/.claude/worktrees/x/src' : '/work/api'), merged: async () => true });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['finish', '2:1'] })).toEqual({ ok: true, output: 'released 2:1' });
  });

  // A nested worktree removed after its merge has no `.git` file left to find it by: gone, it was taken.
  it('finishes a worker whose nested worktree is gone', async () => {
    const { ports } = project({
      directoryOf: (id) => (id === '2:1' ? '/work/api/.claude/worktrees/x' : '/work/api'),
      exists: (folder) => folder !== '/work/api/.claude/worktrees/x',
      holdsWorktree: () => false,
    });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'go'] });
    expect(await answer({ directory: '/work/api', args: ['finish', '2:1'] })).toEqual({ ok: true, output: 'released 2:1' });
  });

  // The other order of the --in refusal below: the --in agent is in no card's record.
  posixPathsOnly('refuses --card a worktree an --in agent is at work in', async () => {
    const { ports, started } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api.worktrees/card-one' : '/work/api') });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--in', '../api.worktrees/card-one', 'one'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--card', 'card-1', 'two'] }))
      .toEqual({ ok: false, output: '2:1 already has an agent at work in /work/api.worktrees/card-one' });
    expect(started.map((each) => each.id)).toEqual(['2:1']);
  });

  // An agent in a worktree nested below the one asked for is at work in its own.
  posixPathsOnly('takes --in a worktree whose only agent is in a worktree nested below it', async () => {
    const { ports } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api-mr174/.claude/worktrees/y' : '/work/api') });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', 'one'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--in', '../api-mr174', 'two'] })).toMatchObject({ ok: true });
  });

  // Two agents in one worktree write over each other's work; main's own checkout is not one.
  posixPathsOnly('refuses --in a worktree another agent is at work in', async () => {
    const { ports, started } = project({ directoryOf: (id) => (id === '2:1' ? '/work/api-mr174/src' : '/work/api') });
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['claim'] });
    await answer({ directory: '/work/api', args: ['run', '2:1', '--in', '../api-mr174', 'one'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--in', '../api-mr174', 'two'] }))
      .toEqual({ ok: false, output: '2:1 already has an agent at work in /work/api-mr174' });
    expect(await answer({ directory: '/work/api', args: ['run', '2:2', '--in', 'packages/web', 'two'] })).toMatchObject({ ok: true });
    expect(started.map((each) => each.id)).toEqual(['2:1', '2:2']);
  });

  posixPathsOnly('refuses --in for a folder the check refuses, and starts nothing', async () => {
    const { ports, started } = project();
    const answer = sessionRequests(ports);
    await answer({ directory: '/work/api', args: ['claim'] });
    expect(await answer({ directory: '/work/api', args: ['run', '2:1', '--in', '/elsewhere', 'go'] }))
      .toEqual({ ok: false, output: '/elsewhere is not a folder' });
    expect(started).toEqual([]);
  });
});
