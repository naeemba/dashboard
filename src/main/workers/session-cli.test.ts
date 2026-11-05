import { describe, expect, it } from 'vitest';
import { outsidePaneRefusal, parseSessionCommand, readsStopInput, stopHookArguments, stopInputArguments } from './session-cli';

describe('parseSessionCommand', () => {
  it('reads the two commands that take nothing', () => {
    expect(parseSessionCommand(['claim'])).toEqual({ ok: true, command: { kind: 'claim', project: null } });
    expect(parseSessionCommand(['list'])).toEqual({ ok: true, command: { kind: 'list', all: false } });
  });

  it('reads claim --project and list --all, and refuses anything else after them', () => {
    expect(parseSessionCommand(['claim', '--project', 'new', 'crm'])).toEqual({ ok: true, command: { kind: 'claim', project: 'new crm' } });
    expect(parseSessionCommand(['list', '--all'])).toEqual({ ok: true, command: { kind: 'list', all: true } });
    expect(parseSessionCommand(['claim', '--project'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['claim', 'crm'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['list', '--all', 'x'])).toMatchObject({ ok: false });
  });

  // The prompt comes in as one quoted word or several; either way it is what the worker is handed.
  it('reads a run, its prompt and where it runs', () => {
    expect(parseSessionCommand(['run', '2:3', 'fix', 'the', 'tests'])).toEqual({
      ok: true, command: { kind: 'run', id: '2:3', prompt: 'fix the tests', card: null, worktree: false, screen: false },
    });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', 'work the card'])).toMatchObject({
      ok: true, command: { card: 'abc', worktree: false, prompt: 'work the card' },
    });
    expect(parseSessionCommand(['run', '2:3', '--worktree', 'rename it'])).toMatchObject({
      ok: true, command: { card: null, worktree: true },
    });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', '--screen', 'work the card'])).toMatchObject({
      ok: true, command: { card: 'abc', screen: true, prompt: 'work the card' },
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

  it('reads what a done waits on, and refuses it on any other state or spelled any other way', () => {
    expect(parseSessionCommand(['notify', '2:3', 'done', '--background', '2', '--scheduled', '0'])).toEqual({
      ok: true, command: { kind: 'notify', id: '2:3', state: 'done', waiting: { background: 2, scheduled: 0 } },
    });
    expect(parseSessionCommand(['notify', '2:3', 'running', '--background', '0', '--scheduled', '0'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['notify', '2:3', 'done', '--background', '2'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['notify', '2:3', 'done', '--background', 'two', '--scheduled', '0'])).toMatchObject({ ok: false });
  });
  it('answers nothing, or a word it does not know, with what it takes', () => {
    expect(parseSessionCommand([])).toMatchObject({ ok: false, message: expect.stringContaining('session claim') });
    expect(parseSessionCommand(['spawn'])).toMatchObject({ ok: false, message: expect.stringMatching(/^no such command: spawn/) });
  });

  it('reads send as the pane and everything after it as the text, and refuses no text', () => {
    expect(parseSessionCommand(['send', '2:3', 'run', 'the', 'tests'])).toEqual({ ok: true, command: { kind: 'send', id: '2:3', text: 'run the tests' } });
    expect(parseSessionCommand(['send', '2:3'])).toEqual({ ok: false, message: 'session send needs the text to type' });
    expect(parseSessionCommand(['send', 'crm', 'hi']).ok).toBe(false);
  });
});

describe('stopInputArguments', () => {
  // Trimmed from a real Stop hook input, Claude Code 2.1.318, with a background shell still running.
  const input = JSON.stringify({
    session_id: '4d756708', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'started',
    background_tasks: [{ id: 'bsil5xrlv', type: 'shell', status: 'running', description: 'Run sleep 25', command: 'sleep 25' }],
    session_crons: [],
  });

  it('is read only for a done, the way the Stop hook spells it', () => {
    expect(readsStopInput(['notify', '2:3', 'done', '--stop-input'])).toBe(true);
    expect(readsStopInput(['notify', '2:3', 'running', '--stop-input'])).toBe(false);
    expect(readsStopInput(['notify', '2:3', 'done'])).toBe(false);
  });

  it('counts what the session still waits on', () => {
    expect(stopInputArguments(input)).toEqual(['--background', '1', '--scheduled', '0']);
  });

  it('sends nothing for input from an older Claude Code, or none that parses', () => {
    expect(stopInputArguments(JSON.stringify({ hook_event_name: 'Stop', background_tasks: [] }))).toEqual([]);
    expect(stopInputArguments('')).toEqual([]);
    expect(stopInputArguments('null')).toEqual([]);
  });

  it('sends the app the counts in place of the flag, and a notify the parser takes', () => {
    const sent = stopHookArguments(['notify', '2:3', 'done', '--stop-input'], input);
    expect(sent).toEqual(['notify', '2:3', 'done', '--background', '1', '--scheduled', '0']);
    expect(parseSessionCommand(sent).ok).toBe(true);
    expect(stopHookArguments(['notify', '2:3', 'done', '--stop-input'], undefined)).toEqual(['notify', '2:3', 'done']);
    expect(stopHookArguments(['list', '--all'], undefined)).toEqual(['list', '--all']);
  });
});

describe('outsidePaneRefusal', () => {
  // A plain terminal has no project of its own: claiming in the folder it stands in would be a guess.
  it('refuses a claim that names no project, and lets everything that names its target through', () => {
    expect(outsidePaneRefusal({ kind: 'claim', project: null })).toContain('--project');
    expect(outsidePaneRefusal({ kind: 'claim', project: 'crm' })).toBeNull();
    expect(outsidePaneRefusal({ kind: 'send', id: '2:3', text: 'hi' })).toBeNull();
    expect(outsidePaneRefusal({ kind: 'list', all: true })).toBeNull();
  });
});
