import { describe, expect, it } from 'vitest';
import type { runProgram } from '../app/git';
import { branchPullRequest, latestMergeRequest } from './merge-request';
import { pullRequestStatus } from './pull-request-status';

const mergeRequest = (iid: number, state: string, status = 'not_open') => ({
  iid, state, title: `Change ${iid}`, web_url: `https://git.arr.lan/fe/app/-/merge_requests/${iid}`,
  sha: `sha${iid}`, detailed_merge_status: status,
});

describe('latestMergeRequest', () => {
  it('records a merge request the way a pull request is recorded', () => {
    expect(latestMergeRequest(JSON.stringify([mergeRequest(197, 'merged')]))).toMatchObject({
      number: 197, state: 'MERGED', title: 'Change 197', url: 'https://git.arr.lan/fe/app/-/merge_requests/197', headRefOid: 'sha197',
    });
  });

  it('follows the open one over an older closed one', () => {
    const listed = [mergeRequest(201, 'opened'), mergeRequest(200, 'closed')];
    expect(latestMergeRequest(JSON.stringify(listed))?.number).toBe(201);
    expect(latestMergeRequest('[]')).toBeNull();
  });

  // A locked merge request is in no state the card has a line for.
  it('drops a state gh has no name for', () => {
    expect(latestMergeRequest(JSON.stringify([mergeRequest(5, 'locked')]))).toBeNull();
  });

  it('gives the card its glyph from the merge status', () => {
    const glyph = (status: string) => pullRequestStatus(latestMergeRequest(JSON.stringify([mergeRequest(9, 'opened', status)]))!);
    expect(glyph('ci_still_running')).toBe('running');
    expect(glyph('mergeable')).toBe('mergeable');
    expect(glyph('not_approved')).toBeNull();
  });
});

describe('branchPullRequest', () => {
  const asked: string[] = [];
  const run = (url: string): typeof runProgram => async (program, programArguments) => {
    const words = `${program} ${programArguments.join(' ')}`;
    asked.push(words);
    if (words === 'git remote') return 'origin';
    if (words === 'git remote get-url origin') return url;
    if (program === 'glab') return JSON.stringify([mergeRequest(3, 'opened')]);
    if (program === 'gh') return JSON.stringify([{ number: 4, state: 'OPEN', title: 'x', url: 'u' }]);
    throw new Error(`${program} failed`);
  };

  it('asks glab on a GitLab project and gh on a GitHub one', async () => {
    expect((await branchPullRequest(run('git@git.arr.lan:fe/app.git'), '/w', 'fix-it', 1000))?.number).toBe(3);
    expect(asked).toContain('glab mr list --source-branch fix-it --all --output json --per-page 20');
    expect((await branchPullRequest(run('git@github.com:me/app.git'), '/w', 'fix-it', 1000))?.number).toBe(4);
  });
});
