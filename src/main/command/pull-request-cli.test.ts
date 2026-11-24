import { describe, expect, it } from 'vitest';
import { conflictedFiles, conflictLine, type ProgramAnswer, isNetworkError, landPullRequest, NO_CHECKS_WAIT_MS, parsePullRequestCommand, PULL_REQUEST_USAGE, RETRY_WAITS_MS, waitOnPullRequest } from './pull-request-cli';

// A gh that answers each command's first two words from the table, in order when a row has several.
function fakeGitHub(answers: Record<string, ProgramAnswer[]>) {
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

const open = { ok: true, output: 'OPEN abc123 main MERGEABLE https://github.com/acme/api/pull/12' };
const conflicting = { ok: true, output: 'OPEN abc123 main CONFLICTING https://github.com/acme/api/pull/12' };
const RECENT_CHECKS = 'pr list --repo github.com/acme/api --state merged --limit 20 --json statusCheckRollup -q [.[].statusCheckRollup | length] | add // 0';
const none = { ok: false, output: 'no checks reported on the \'fix\' branch' };
const lostAnswer = 'Post https://api.github.com/graphql: unexpected EOF';
// Every try a patient gh call makes, each answer lost.
const lostEveryTry = () => Array.from({ length: RETRY_WAITS_MS.length + 1 }, () => ({ ok: false, output: lostAnswer }));
const MERGE = 'pr merge 12 --merge --match-head-commit abc123';
const merges = (github: { asked: string[] }) => github.asked.filter((each) => each === MERGE).length;

describe('parsePullRequestCommand', () => {
  // --project is taken out before, by boardTarget, as for `board`.
  it('reads land and its pull request', () => {
    expect(parsePullRequestCommand(['land', '12'])).toEqual({ ok: true, verb: 'land', target: '12' });
    expect(parsePullRequestCommand(['wait', '12'])).toEqual({ ok: true, verb: 'wait', target: '12' });
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
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123', base: 'main' });
    expect(github.asked.at(-1)).toBe(MERGE);
  });

  it('merges nothing when a check fails', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: 'test\tfail' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'test\tfail\n\na check failed on abc123; 12 is not merged' });
    expect(github.asked.some((each) => each.startsWith('pr merge'))).toBe(false);
  });

  it('asks again a minute on when no checks are reported, and merges a repository whose pull requests never reported a check', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [none, none], 'pr list': [{ ok: true, output: '0' }], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123, a repository with no CI', base: 'main' });
    expect(github.waited).toEqual([NO_CHECKS_WAIT_MS]);
    expect(github.asked).toContain(RECENT_CHECKS);
  });

  // Seen: CI that never started on the head commit, and the land merged it unchecked. CI on a push
  // trigger runs no pull_request event, and still reports its checks on the merged pull requests.
  it('merges nothing when no checks start in a repository whose pull requests run CI, whatever triggers it', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [none, none], 'pr list': [{ ok: true, output: '2' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'no checks reported on abc123 a minute on, in a repository whose pull requests run CI; 12 is not merged' });
    expect(merges(github)).toBe(0);
  });

  // A url target may name another repository than the folder's: its CI is the one asked about.
  it('asks the pull request\'s own repository, on its own host, whether it runs CI', async () => {
    const url = 'https://git.example.com/other/web/pull/5';
    const view = { ok: true, output: `OPEN abc123 main MERGEABLE ${url}` };
    const github = fakeGitHub({ 'pr view': [view, view], 'pr checks': [none, none], 'pr list': [{ ok: true, output: '7' }] });
    expect(await landPullRequest(github.ports, url)).toMatchObject({ ok: false });
    expect(github.asked).toContain(RECENT_CHECKS.replace('github.com/acme/api', 'git.example.com/other/web'));
    expect(github.asked.some((each) => each.startsWith('pr merge'))).toBe(false);
  });

  it('merges nothing when gh cannot say whether the repository\'s pull requests report checks', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [none, none], 'pr list': [{ ok: false, output: 'HTTP 403' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'HTTP 403\n\nno checks reported on abc123, and gh could not say whether the repository has CI; 12 is not merged' });
    expect(merges(github)).toBe(0);
  });

  it('says the answer was lost when asking whether the repository has CI lost it every try', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [none, none], 'pr list': lostEveryTry() });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `${lostAnswer}\n\nlost gh's answer for 4 minutes asking whether 12's repository has CI; nothing is merged, run it again` });
    expect(merges(github)).toBe(0);
  });

  // Never the folder's repository in its place: a url target may name another.
  it('merges nothing when gh gives no url for the pull request', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'OPEN abc123 main MERGEABLE' }, open], 'pr checks': [none, none] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false, output: expect.stringContaining('gh gave no repository for 12') });
    expect(github.asked.some((each) => each.startsWith('pr list') || each.startsWith('pr merge'))).toBe(false);
  });

  it('waits on checks that started by the second ask', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [none, { ok: false, output: 'lint\tfail' }] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false, output: expect.stringContaining('a check failed') });
  });

  it('watches once more when the wait on the checks lost its answer', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: lostAnswer }, { ok: true, output: '' }], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123', base: 'main' });
  });

  it('says the answer was lost, not that a check failed, once every try lost it', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': lostEveryTry() });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `${lostAnswer}\n\nlost gh's answer for 4 minutes waiting on the checks of 12; nothing is merged, run it again` });
    expect(merges(github)).toBe(0);
    expect(github.waited).toEqual(RETRY_WAITS_MS);
  });

  it('says the answer was lost when reading the pull request lost it every try', async () => {
    const github = fakeGitHub({ 'pr view': lostEveryTry() });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `${lostAnswer}\n\nlost gh's answer for 4 minutes reading 12; nothing is merged, run it again` });
    expect(github.asked.some((each) => each.startsWith('pr checks'))).toBe(false);
  });

  // Seen: a land that gave up on gh's first question, with the network down for a minute.
  it('asks again, waiting longer each time, when gh cannot reach GitHub', async () => {
    const offline = { ok: false, output: 'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com' };
    const github = fakeGitHub({ 'pr view': [offline, offline, offline, open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: true });
    expect(github.waited).toEqual(RETRY_WAITS_MS.slice(0, 3));
  });

  // A push during the wait moves the head off the noted commit, and GitHub refuses the merge.
  it('says the merge gh refused', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: 'Head branch was modified' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'Head branch was modified\n\ngh refused to merge 12 at abc123' });
    expect(merges(github)).toBe(1);
  });

  // Seen: the merge went through and only gh's answer was lost.
  it('reports merged when the merge call failed but the pull request merged at the noted commit', async () => {
    const github = fakeGitHub({ 'pr view': [open, { ok: true, output: 'MERGED abc123 main' }], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: lostAnswer }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123', base: 'main' });
    expect(merges(github)).toBe(1);
  });

  it('tries a merge lost to a network error once more', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: lostAnswer }, { ok: true, output: '' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'merged 12 at abc123', base: 'main' });
    expect(merges(github)).toBe(2);
  });

  it('stops once every try lost the merge\'s answer', async () => {
    const tries = RETRY_WAITS_MS.length + 1;
    const github = fakeGitHub({ 'pr view': Array.from({ length: tries + 1 }, () => open), 'pr checks': [{ ok: true, output: '' }], 'pr merge': lostEveryTry() });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: `${lostAnswer}\n\nlost gh's answer merging 12 at abc123; it may have merged, check before running it again` });
    expect(merges(github)).toBe(tries);
    expect(github.waited).toEqual(RETRY_WAITS_MS);
  });

  // CI does not run on a pull request that conflicts: the land says so instead of "no checks reported".
  it('says a pull request conflicts before waiting on it', async () => {
    const github = fakeGitHub({ 'pr view': [conflicting] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: '12 conflicts with main', conflicts: { base: 'main', sha: 'abc123' } });
    expect(github.asked).toHaveLength(1);
  });

  it('says a pull request conflicts when it came to after the first look', async () => {
    const github = fakeGitHub({ 'pr view': [open, conflicting], 'pr checks': [none, none] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false, conflicts: { base: 'main', sha: 'abc123' } });
  });

  it('says a merge refused for a conflict is one', async () => {
    const refused = { ok: false, output: 'Pull request acme/api#12 is not mergeable: the merge commit cannot be cleanly created.' };
    const github = fakeGitHub({ 'pr view': [open, conflicting], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [refused] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false, conflicts: { base: 'main', sha: 'abc123' } });
    expect(merges(github)).toBe(1);
  });

  // Merged at another commit is not the commit whose checks passed.
  it('does not count a merge at another commit', async () => {
    const github = fakeGitHub({ 'pr view': [open, { ok: true, output: 'MERGED def456 main' }], 'pr checks': [{ ok: true, output: '' }], 'pr merge': [{ ok: false, output: 'Head branch was modified' }] });
    expect(await landPullRequest(github.ports, '12')).toMatchObject({ ok: false });
  });

  it('lands nothing that is not open', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'MERGED abc123 main' }] });
    expect(await landPullRequest(github.ports, '12')).toEqual({ ok: false, output: 'pull request 12 is merged, not open' });
    expect(github.asked).toHaveLength(1);
  });
});

describe('waitOnPullRequest', () => {
  it('waits on the head commit\'s checks and merges nothing', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: true, output: 'all green' }] });
    expect(await waitOnPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'checks passed on abc123' });
    expect(github.asked.some((each) => each.startsWith('pr merge'))).toBe(false);
  });

  it('says what failed, as land does', async () => {
    const github = fakeGitHub({ 'pr view': [open], 'pr checks': [{ ok: false, output: 'test\tfail' }] });
    expect(await waitOnPullRequest(github.ports, '12')).toMatchObject({ ok: false, output: expect.stringContaining('a check failed on abc123') });
  });

  it('passes a repository with no CI', async () => {
    const github = fakeGitHub({ 'pr view': [open, open], 'pr checks': [none, none], 'pr list': [{ ok: true, output: '0' }] });
    expect(await waitOnPullRequest(github.ports, '12')).toEqual({ ok: true, output: 'no checks to wait on at abc123, a repository with no CI' });
  });
});

describe('conflictLine', () => {
  it('names the files merge-tree found conflicted, and what the worker does', () => {
    const tree = { ok: false, output: 'd42f6e61ad4e0d57aafb840bff3a24b687535dec\nsrc/a.ts\ndocs/b.md\n' };
    expect(conflictLine('github', 'main', tree)).toBe('conflicts with main: src/a.ts, docs/b.md — merge github/main into the branch, resolve, push, and run it again');
  });

  // A fetch that failed, or a git before merge-tree --write-tree: still a conflict, said without the files.
  it('says so when git could not name them', () => {
    expect(conflictLine('origin', 'main', { ok: false, output: 'fatal: couldn\'t find remote ref main' })).toContain('conflicts with main: git could not name the files (fatal');
    expect(conflictLine('origin', 'main', { ok: true, output: 'd42f6e61ad4e0d57aafb840bff3a24b687535dec' })).toContain('git could not name the files');
  });
});

describe('conflictedFiles', () => {
  const conflicts = { base: 'main', sha: 'abc123' };
  const tree = { ok: false, output: 'd42f6e61ad4e0d57aafb840bff3a24b687535dec\nsrc/a.ts\n' };

  it('fetches from the project\'s remote, then merges the fetched base with the head', async () => {
    const asked: string[] = [];
    const answers = [{ ok: true, output: '' }, tree];
    const git = async (words: string[]) => { asked.push(words.join(' ')); return answers.shift() ?? { ok: false, output: 'asked too often' }; };
    expect(await conflictedFiles(git, 'github', conflicts)).toBe('conflicts with main: src/a.ts — merge github/main into the branch, resolve, push, and run it again');
    expect(asked).toEqual(['fetch github main abc123', 'merge-tree --write-tree --name-only --no-messages github/main abc123']);
  });

  it('passes a failed fetch on without merging', async () => {
    const asked: string[] = [];
    const git = async (words: string[]) => { asked.push(words[0]); return { ok: false, output: 'fatal: couldn\'t find remote ref main' }; };
    expect(await conflictedFiles(git, 'origin', conflicts)).toContain('git could not name the files (fatal: couldn\'t find remote ref main)');
    expect(asked).toEqual(['fetch']);
  });

  it('says a git that throws as the line without the files', async () => {
    const git = async () => { throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }); };
    expect(await conflictedFiles(git, 'origin', conflicts)).toContain('git could not name the files (spawn git ENOENT)');
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
    ['error connecting to api.github.com', true],
    ['HTTP 502: Bad Gateway (https://api.github.com/graphql)', true],
    ['GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)', false],
    ['HTTP 422: Validation Failed (https://api.github.com/repos/o/r/pulls/12/merge)', false],
    ['Pull request o/r#12 is not mergeable: the merge commit cannot be cleanly created.', false],
    ['test\tfail', false],
    ['integration\tfail\t1m\thttps://ci.example/1\terror connecting to postgres', false],
  ])('%s → %s', (output, expected) => {
    expect(isNetworkError({ ok: false, output })).toBe(expected);
  });

  it('is never a call that succeeded', () => {
    expect(isNetworkError({ ok: true, output: 'Post "https://api.github.com/graphql": unexpected EOF' })).toBe(false);
  });
});
