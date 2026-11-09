import { describe, expect, it } from 'vitest';
import { MANAGER_PROJECT } from '../../shared/manager/manager';
import { FOLLOW_GAP_MS, pullRequestSweep, type PullRequestSweepPorts } from './pull-request-sweep';

function sweepWith(over: Partial<PullRequestSweepPorts> = {}) {
  const seen = { followed: [] as string[], warnings: [] as string[] };
  let now = 0;
  const sweep = pullRequestSweep({
    projectBoard: (projectPath) => projectPath !== MANAGER_PROJECT.path && !projectPath.includes('.worktrees/'),
    followed: () => ['a', 'b'],
    follow: async (_projectPath, id) => { seen.followed.push(id); },
    warn: (_projectPath, message) => { seen.warnings.push(message); },
    now: () => now,
    ...over,
  });
  return { sweep, seen, later: (ms: number) => { now += ms; } };
}

describe('pullRequestSweep', () => {
  it('follows every card, then skips a check asked for too soon after', async () => {
    const { sweep, seen, later } = sweepWith();
    await sweep.check('/work/api');
    await sweep.check('/work/api');
    expect(seen.followed).toEqual(['a', 'b']);
    later(FOLLOW_GAP_MS);
    await sweep.check('/work/api');
    expect(seen.followed).toEqual(['a', 'b', 'a', 'b']);
  });

  it('runs one check per project at a time, and never on a board that is not a project\'s own', async () => {
    const { sweep, seen, later } = sweepWith();
    later(FOLLOW_GAP_MS);
    await Promise.all([sweep.check('/work/api'), sweep.check('/work/api')]);
    expect(seen.followed).toEqual(['a', 'b']);
    await sweep.check(MANAGER_PROJECT.path);
    await sweep.check('/work/api.worktrees/fix-login');
    expect(seen.followed).toEqual(['a', 'b']);
  });

  it('stops at the first gh failure and warns once until a check goes through', async () => {
    let failing = true;
    const { sweep, seen, later } = sweepWith({
      follow: async (_projectPath, id) => {
        if (failing) throw new Error('gh: command not found');
        seen.followed.push(id);
      },
    });
    await sweep.check('/work/api');
    later(FOLLOW_GAP_MS);
    await sweep.check('/work/api');
    expect(seen.warnings).toEqual(['pull requests not checked, no card moved: gh: command not found']);
    failing = false;
    later(FOLLOW_GAP_MS);
    await sweep.check('/work/api');
    failing = true;
    later(FOLLOW_GAP_MS);
    await sweep.check('/work/api');
    expect(seen.warnings).toHaveLength(2);
  });
});
