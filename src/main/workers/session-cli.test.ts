import { describe, expect, it } from 'vitest';
import { parseSessionCommand } from './session-cli';

describe('parseSessionCommand', () => {
  it('reads the two commands that take nothing', () => {
    expect(parseSessionCommand(['claim'])).toEqual({ ok: true, command: { kind: 'claim' } });
    expect(parseSessionCommand(['list'])).toEqual({ ok: true, command: { kind: 'list' } });
  });

  // The prompt comes in as one quoted word or several; either way it is what the worker is handed.
  it('reads a run, its prompt and where it runs', () => {
    expect(parseSessionCommand(['run', '2:3', 'fix', 'the', 'tests'])).toEqual({
      ok: true, command: { kind: 'run', id: '2:3', prompt: 'fix the tests', card: null, worktree: false },
    });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', 'work the card'])).toMatchObject({
      ok: true, command: { card: 'abc', worktree: false, prompt: 'work the card' },
    });
    expect(parseSessionCommand(['run', '2:3', '--worktree', 'rename it'])).toMatchObject({
      ok: true, command: { card: null, worktree: true },
    });
  });

  it('refuses a run with no prompt, or with both places to run it', () => {
    expect(parseSessionCommand(['run', '2:3'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--card'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', '--worktree', 'go'])).toMatchObject({ ok: false });
  });

  // The editor is numbered below the terminals, and nothing here is for it.
  it('takes only a terminal id', () => {
    expect(parseSessionCommand(['release', '2:3'])).toEqual({ ok: true, command: { kind: 'release', id: '2:3' } });
    expect(parseSessionCommand(['release', '2:-1'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['release'])).toMatchObject({ ok: false });
  });

  it('reads the three things a worker\'s hooks report and nothing else', () => {
    expect(parseSessionCommand(['notify', '2:3', 'blocked'])).toEqual({ ok: true, command: { kind: 'notify', id: '2:3', state: 'blocked' } });
    expect(parseSessionCommand(['notify', '2:3', 'running'])).toEqual({ ok: true, command: { kind: 'notify', id: '2:3', state: 'running' } });
    expect(parseSessionCommand(['notify', '2:3', 'finished'])).toMatchObject({ ok: false });
  });

  it('answers nothing, or a word it does not know, with what it takes', () => {
    expect(parseSessionCommand([])).toMatchObject({ ok: false, message: expect.stringContaining('session claim') });
    expect(parseSessionCommand(['spawn'])).toMatchObject({ ok: false, message: expect.stringMatching(/^no such command: spawn/) });
  });
});
