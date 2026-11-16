import { describe, expect, it } from 'vitest';
import { type GitHubAnswer, isNetworkError, landPullRequest, NO_CHECKS_WAIT_MS, parsePullRequestCommand, PULL_REQUEST_USAGE, RETRY_WAIT_MS } from './pull-request-cli';

// A gh that answers each command's first two words from the table, in order when a row has several.
function fakeGitHub(answers: Record<string, GitHubAnswer[]>) {
  const asked: string[] = [];
  const waited: number[] = [];
  return {
    asked,
    waited,
    ports: {
      gh: async (words: string[]) => {
        asked.push(words.join(' '));
        return answers[words.slice(0, 2).join(' ')].shift() ?? { ok: false, output: 'asked too often' };
      },
      wait: async (milliseconds: number) => { waited.push(milliseconds); },
    },
  };
}

const open = { ok: true, output: 'OPEN abc123' };
const none = { ok: false, output: 'no checks reported on the \'fix\' branch' };
const lostAnswer = 'Post https://api.github.com/graphql: unexpected EOF';
const MERGE = 'pr merge 12 --merge --match-head-commit abc123';
const merges = (github: { asked: string[] }) => github.asked.filter((each) => each === MERGE).length;

describe('parsePullRequestCommand', () => {
  // --project is taken out before, by boardTarget, as for `board`.
  it('reads land and its pull request', () => {
    expect(parsePullRequestCommand(['land', '12'])).toEqual({ ok: true, target: '12' });
  });

  it('answers no verb with the usage and refuses anything else', () => {
    expect(parsePullRequestCommand([])).toEqual({ ok: false, message: PULL_REQUEST_USAGE });
    expect(parsePullRequestCommand(['merge', '12'])).toMatchObject({ ok: false, message: expect.stringContaining('no such command: merge') });
    expect(parsePullRequestCommand(['land'])).toMatchObject({ ok: false });
    expect(parsePullRequestCommand(['land', '12', '13'])).toMatchObject({ ok: false });
    expect(parsePullRequestCommand(['land', '--help'])).toEqual({ ok: false, message: PULL_REQUEST_USAGE });
  });
});

describe('landPullRequest', () => {
  it('merges the head commit it noted once every check on it passed', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: true, output: 'all green' }], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123' });
    expect(github.asked.at(-1)).toBe(MERGE);
  });

  it('merges nothing when a check fails', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: 'test\tfail' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'a check failed on abc123; 12 is not merged\n\ntest\tfail' });
    expect(github.asked.some((each) => each.startsWith('pr merge'))).toBe(false);
  });

  it('asks again a minute on when no checks are reported, and merges a repository that runs none', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [none, none], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123, with no checks reported' });
    expect(github.waited).toEqual([NO_CHECKS_WAIT_MS]);
  });

  it('waits on checks that started by the second ask', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [none, { ok: false, output: 'lint\tfail' }] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false, output: expect.stringContaining('a check failed') });
  });

  it('watches once more when the wait on the checks lost its answer', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: lostAnswer }, { ok: true, output: '' }], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123' });
  });

  it('says the answer was lost, not that a check failed, after a second lost wait', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: lostAnswer }, { ok: false, output: lostAnswer }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `lost gh's answer twice waiting on the checks of 12; nothing is merged, run it again\n\n${lostAnswer}` });
    expect(merges(github)).toBe(0);
    expect(github.waited).toEqual([RETRY_WAIT_MS]);
  });

  // A push during the wait moves the head off the noted commit, and GitHub refuses the merge.
  it('says the merge gh refused', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: 'Head branch was modified' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'gh refused to merge 12 at abc123: Head branch was modified' });
    expect(merges(github)).toBe(1);
  });

  // Seen: the merge went through and only gh's answer was lost.
  it('reports merged when the merge call failed but the pull request merged at the noted commit', async () => {
    const github = fakeGitHub({ 'pr view': [open, { ok: true, output: 'MERGED abc123' }], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: lostAnswer }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123' });
    expect(merges(github)).toBe(1);
  });

  it('tries a merge lost to a network error once more', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: lostAnswer }, { ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123' });
    expect(merges(github)).toBe(2);
  });

  it('stops after the second network error', async () => {
    const github = fakeGitHub({ 'pr view': [open, open, open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: lostAnswer }, { ok: false, output: lostAnswer }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `lost gh's answer merging 12 at abc123; it may have merged, check before running it again: ${lostAnswer}` });
    expect(merges(github)).toBe(2);
    expect(github.waited).toEqual([RETRY_WAIT_MS]);
  });

  // Merged at another commit is not the commit whose checks passed.
  it('does not count a merge at another commit', async () => {
    const github = fakeGitHub({ 'pr view': [open, { ok: true, output: 'MERGED def456' }], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: 'Head branch was modified' }] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false });
  });

  it('lands nothing that is not open', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'MERGED abc123' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'pull request 12 is merged, not open' });
    expect(github.asked).toHaveLength(1);
  });
});

describe('isNetworkError', () => {
  // Real gh lines: a lost request or answer is tried again, a refusal never.
  it.each([
    ['Post "https://api.github.com/graphql": unexpected EOF', true],
    ['Get "https://api.github.com/repos/o/r": dial tcp: lookup api.github.com: no such host', true],
    ['read tcp 10.0.0.2:5123->140.82.112.6:443: read: connection reset by peer', true],
    ['dial tcp 140.82.112.6:443: connect: connection refused', true],
    ['dial tcp 140.82.112.6:443: i/o timeout', true],
    ['net/http: TLS handshake timeout', true],
    ['HTTP 502: Bad Gateway (https://api.github.com/graphql)', true],
    ['GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)', false],
    ['HTTP 422: Validation Failed (https://api.github.com/repos/o/r/pulls/12/merge)', false],
    ['Pull request o/r#12 is not mergeable: the merge commit cannot be cleanly created.', false],
    ['test\tfail', false],
  ])('%s → %s', (output, expected) => {
    expect(isNetworkError({ ok: false, output })).toBe(expected);
  });

  it('is never a call that succeeded', () => {
    expect(isNetworkError({ ok: true, output: 'Post "https://api.github.com/graphql": unexpected EOF' })).toBe(false);
  });
});
