import { describe, expect, it } from 'vitest';
import type { ProgramAnswer } from './gh-answer';
import { parseWriteCommand, writePullRequest } from './pull-request-write-cli';

// A gh that answers each command's first two words from the table, in order.
function fakeGitHub(answers: Record<string, ProgramAnswer[]>) {
  const asked: string[] = [];
  return {
    asked,
    ports: {
      gh: async (words: string[]) => {
        asked.push(words.join(' '));
        return answers[words.slice(0, 2).join(' ')]?.shift() ?? { ok: false, output: 'asked too often' };
      },
      wait: async () => {},
    },
  };
}

const badGateway = { ok: false, output: 'non-200 OK status code: 502 Bad Gateway body: ""' };
const lost = { ok: false, output: 'Post "https://api.github.com/graphql": unexpected EOF' };
const none = { ok: false, output: 'no pull requests found for branch "fix-it"' };
const url = 'https://github.com/acme/api/pull/12';
const tries = (github: { asked: string[] }, verb: string) => github.asked.filter((each) => each.startsWith(`pr ${verb}`)).length;

describe('parseWriteCommand', () => {
  it('reads each verb and refuses what it cannot', () => {
    expect(parseWriteCommand('create', ['--title', 'x'])).toEqual({ ok: true, write: { verb: 'create', words: ['--title', 'x'] } });
    expect(parseWriteCommand('ready', ['12'])).toEqual({ ok: true, write: { verb: 'ready', target: '12', undo: false } });
    expect(parseWriteCommand('comment', ['--body', 'hi', '12'])).toEqual({ ok: true, write: { verb: 'comment', target: '12', body: 'hi' } });
    expect(parseWriteCommand('ready', [])).toMatchObject({ ok: false });
    expect(parseWriteCommand('ready', ['--help'])).toMatchObject({ ok: false });
    expect(parseWriteCommand('comment', ['12'])).toMatchObject({ ok: false });
    expect(parseWriteCommand('comment', ['12', '13', '-b', 'hi'])).toMatchObject({ ok: false });
  });
});

describe('pr create', () => {
  it('prints the branch\'s open pull request instead of opening a second', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: url }] });
    expect(await writePullRequest(github.ports, { verb: 'create', words: [] })).toEqual({ ok: true, output: `${url}\nalready open for this branch` });
    expect(tries(github, 'create')).toBe(0);
  });

  it('after a 502 that opened it, prints it rather than trying again', async () => {
    const github = fakeGitHub({ 'pr view': [none, { ok: true, output: url }], 'pr create': [badGateway] });
    expect(await writePullRequest(github.ports, { verb: 'create', words: ['--fill'] })).toMatchObject({ ok: true, output: expect.stringContaining(url) });
    expect(tries(github, 'create')).toBe(1);
  });

  it('tries again after a 502 that opened nothing', async () => {
    const github = fakeGitHub({ 'pr view': [none, none], 'pr create': [badGateway, { ok: true, output: url }] });
    expect(await writePullRequest(github.ports, { verb: 'create', words: [] })).toEqual({ ok: true, output: url });
  });

  it('never tries again while the look is lost too, and says so at the end', async () => {
    const github = fakeGitHub({ 'pr view': [none, ...Array.from({ length: 10 }, () => lost)], 'pr create': [lost] });
    expect(await writePullRequest(github.ports, { verb: 'create', words: [] })).toMatchObject({ ok: false, output: expect.stringContaining('look before running it again') });
    expect(tries(github, 'create')).toBe(1);
  });

  it('passes a refusal through', async () => {
    const github = fakeGitHub({ 'pr view': [none], 'pr create': [{ ok: false, output: 'must first push the current branch' }] });
    expect(await writePullRequest(github.ports, { verb: 'create', words: [] })).toEqual({ ok: false, output: 'must first push the current branch' });
  });
});

describe('pr ready', () => {
  it('says a ready pull request is ready already', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'false' }] });
    expect(await writePullRequest(github.ports, { verb: 'ready', target: '12', undo: false })).toEqual({ ok: true, output: '12 is ready for review already' });
    expect(tries(github, 'ready')).toBe(0);
  });

  it('marks a draft ready, and a 502 that did is done', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'true' }, { ok: true, output: 'false' }], 'pr ready': [badGateway] });
    expect(await writePullRequest(github.ports, { verb: 'ready', target: '12', undo: false })).toEqual({ ok: true, output: '12 is ready for review' });
  });

  it('with --undo, makes it a draft', async () => {
    const github = fakeGitHub({ 'pr view': [{ ok: true, output: 'false' }], 'pr ready': [{ ok: true, output: 'converted to draft' }] });
    expect(await writePullRequest(github.ports, { verb: 'ready', target: '12', undo: true })).toEqual({ ok: true, output: 'converted to draft' });
    expect(github.asked).toContain('pr ready 12 --undo');
  });
});

describe('pr comment', () => {
  it('posts without looking first, and a lost post that landed is not posted twice', async () => {
    const github = fakeGitHub({ 'pr comment': [lost], 'pr view': [{ ok: true, output: 'Review loop started\n' }] });
    expect(await writePullRequest(github.ports, { verb: 'comment', target: '12', body: 'Review loop started' })).toEqual({ ok: true, output: 'commented on 12' });
    expect(tries(github, 'comment')).toBe(1);
  });

  it('posts again when the lost one is not there', async () => {
    const github = fakeGitHub({ 'pr comment': [lost, { ok: true, output: `${url}#issuecomment-1` }], 'pr view': [{ ok: true, output: 'something else' }] });
    expect(await writePullRequest(github.ports, { verb: 'comment', target: '12', body: 'hi' })).toEqual({ ok: true, output: `${url}#issuecomment-1` });
  });
});
