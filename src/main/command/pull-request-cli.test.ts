import { describe, expect, it } from 'vitest';
import { type GitHubAnswer, landPullRequest, NO_CHECKS_WAIT_MS, parsePullRequestCommand, PULL_REQUEST_USAGE } from './pull-request-cli';

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
const MERGE = 'pr merge 12 --merge --match-head-commit abc123';

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

  // A push during the wait moves the head off the noted commit, and GitHub refuses the merge.
  it('says the merge gh refused', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: 'Head branch was modified' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'gh refused to merge 12 at abc123: Head branch was modified' });
  });

  it('lands nothing that is not open', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'MERGED abc123' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'pull request 12 is merged, not open' });
    expect(github.asked).toHaveLength(1);
  });
});
