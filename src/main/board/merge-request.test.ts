import { describe, expect, it } from 'vitest';
import { answeringPrograms, remoteAt } from '../testing/answering-programs';
import { branchPullRequest, latestMergeRequest, openPullRequests } from './merge-request';
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
  });
});

describe('branchPullRequest', () => {
  const run = (url: string) => answeringPrograms({
    ...remoteAt(url),
    'glab mr list --source-branch fix-it --all --output json --per-page 20': JSON.stringify([mergeRequest(3, 'opened')]),
    'gh pr list': JSON.stringify([{ number: 4, state: 'OPEN', title: 'x', url: 'u' }]),
  });

  it('asks glab on a GitLab project and gh on a GitHub one', async () => {
    expect((await branchPullRequest(run('git@git.arr.lan:fe/app.git'), '/w', 'fix-it', 1000))?.number).toBe(3);
    expect((await branchPullRequest(run('git@github.com:me/app.git'), '/w', 'fix-it', 1000))?.number).toBe(4);
  });
});

describe('openPullRequests', () => {
  const run = (url: string) => answeringPrograms({
    ...remoteAt(url),
    'glab mr list --output json --per-page 100': JSON.stringify([{ ...mergeRequest(3, 'opened'), source_branch: 'fix-it' }]),
    'gh pr list': JSON.stringify([{ number: 4, state: 'OPEN', title: 'x', url: 'u', headRefName: 'other' }, { number: 'junk' }]),
  });

  it('names each open one by its branch, from glab or gh', async () => {
    expect((await openPullRequests(run('git@git.arr.lan:fe/app.git'), '/w', 1000)).map(({ branch, pull }) => [branch, pull.number]))
      .toEqual([['fix-it', 3]]);
    expect((await openPullRequests(run('git@github.com:me/app.git'), '/w', 1000)).map(({ branch, pull }) => [branch, pull.number]))
      .toEqual([['other', 4]]);
  });
});
