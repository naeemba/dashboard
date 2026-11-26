import { describe, expect, it } from 'vitest';
import { conflictedLine, conflictedWords, hookArguments, landedLine, landedWords, olderNotifyArguments, outsidePaneRefusal, parseSessionCommand, promptInputArguments, readsHookInput, retriesInOlderWords, stopInputArguments } from './session-cli';

describe('parseSessionCommand', () => {
  it('reads the two commands that take nothing', () => {
    expect(parseSessionCommand(['claim'])).toEqual({ ok: true, command: { kind: 'claim', project: null } });
    expect(parseSessionCommand(['list'])).toEqual({ ok: true, command: { kind: 'list', all: false, reports: false } });
  });

  it('reads claim --project and list --all, and refuses anything else after them', () => {
    expect(parseSessionCommand(['claim', '--project', 'new', 'crm'])).toEqual({ ok: true, command: { kind: 'claim', project: 'new crm' } });
    expect(parseSessionCommand(['list', '--all'])).toEqual({ ok: true, command: { kind: 'list', all: true, reports: false } });
    expect(parseSessionCommand(['list', '--reports', '--all'])).toEqual({ ok: true, command: { kind: 'list', all: true, reports: true } });
    expect(parseSessionCommand(['list', '--reports', '--reports'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['claim', '--project'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['claim', 'crm'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['list', '--all', 'x'])).toMatchObject({ ok: false });
  });

  // The prompt comes in as one quoted word or several; either way it is what the worker is handed.
  it('reads a run, its prompt and where it runs', () => {
    expect(parseSessionCommand(['run', '2:3', 'fix', 'the', 'tests'])).toEqual({
      ok: true, command: { kind: 'run', id: '2:3', prompt: 'fix the tests', card: null, worktree: false, folder: null, as: null },
    });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', 'work the card'])).toMatchObject({
      ok: true, command: { card: 'abc', worktree: false, prompt: 'work the card' },
    });
    expect(parseSessionCommand(['run', '2:3', '--worktree', 'rename it'])).toMatchObject({
      ok: true, command: { card: null, worktree: true },
    });
    expect(parseSessionCommand(['run', '2:3', '--in', '../api-mr174', 'review it'])).toMatchObject({
      ok: true, command: { card: null, worktree: false, folder: '../api-mr174', prompt: 'review it' },
    });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', '--screen', 'work the card'])).toMatchObject({
      ok: true, command: { card: 'abc', as: 'screen', prompt: 'work the card' },
    });
  });

  // start is run with no pane: the pool claims one when it starts.
  it('reads a start with run\'s words, its project and its place in the queue', () => {
    expect(parseSessionCommand(['start', '--worktree', 'fix', 'it'])).toEqual({
      ok: true, command: { kind: 'start', prompt: 'fix it', card: null, worktree: true, folder: null, as: null, project: null, first: false, after: null },
    });
    expect(parseSessionCommand(['start', '--project', 'crm', '--first', '--after', 'abc', '--card', 'def', 'work it'])).toMatchObject({
      ok: true, command: { kind: 'start', project: 'crm', first: true, after: 'abc', card: 'def', prompt: 'work it' },
    });
    expect(parseSessionCommand(['start', '--after'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['start', '--first'])).toEqual({ ok: false, message: 'pane start needs a prompt for the worker' });
    // run takes neither: its pane is the one given.
    expect(parseSessionCommand(['run', '2:3', '--first', 'go'])).toMatchObject({ ok: true, command: { prompt: '--first go' } });
  });

  it('reads queue and unqueue', () => {
    expect(parseSessionCommand(['queue'])).toEqual({ ok: true, command: { kind: 'queue' } });
    expect(parseSessionCommand(['queue', 'x'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['unqueue', 'q7'])).toEqual({ ok: true, command: { kind: 'unqueue', id: 'q7' } });
    expect(parseSessionCommand(['unqueue'])).toMatchObject({ ok: false });
  });

  // Only what was asked for: which one a plain run gets is pane.dispatch's (paneKind).
  it('reads --screen and --terminal as asked for, and neither as the default\'s', () => {
    expect(parseSessionCommand(['run', '2:3', '--terminal', 'go'])).toMatchObject({ ok: true, command: { as: 'terminal', prompt: 'go' } });
    expect(parseSessionCommand(['run', '2:3', '--screen', 'go'])).toMatchObject({ ok: true, command: { as: 'screen', prompt: 'go' } });
    expect(parseSessionCommand(['run', '2:3', 'go'])).toMatchObject({ ok: true, command: { as: null } });
  });

  it('refuses --screen and --terminal together', () => {
    expect(parseSessionCommand(['run', '2:3', '--terminal', '--screen', 'go'])).toMatchObject({ ok: false });
  });

  it('refuses a run with no prompt, or with both places to run it', () => {
    expect(parseSessionCommand(['run', '2:3'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--card'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', '--worktree', 'go'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--in', '../api-mr174', '--worktree', 'go'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', '--card', 'abc', '--in', '../api-mr174', 'go'])).toMatchObject({ ok: false });
    expect(parseSessionCommand(['run', '2:3', 'go', '--in'])).toMatchObject({ ok: false });
  });

  // The editor is numbered below the terminals, and nothing here is for it.
  it('takes only a terminal id', () => {
    expect(parseSessionCommand(['release', '2:3'])).toEqual({ ok: true, command: { kind: 'release', id: '2:3' } });
    expect(parseSessionCommand(['finish', '2:3'])).toEqual({ ok: true, command: { kind: 'finish', id: '2:3' } });
    expect(parseSessionCommand(['finish'])).toMatchObject({ ok: false });
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

  it('reads a done\'s last message and a running\'s prompt source, each only on its own state', () => {
    expect(parseSessionCommand(['notify', '2:3', 'done', '--background', '0', '--scheduled', '0', '--last-message', 'Opened #12.'])).toEqual({
      ok: true, command: { kind: 'notify', id: '2:3', state: 'done', waiting: { background: 0, scheduled: 0 }, told: { lastMessage: 'Opened #12.' } },
    });
    expect(parseSessionCommand(['notify', '2:3', 'running', '--prompt-source', 'user'])).toEqual({
      ok: true, command: { kind: 'notify', id: '2:3', state: 'running', told: { promptSource: 'user' } },
    });
    expect(parseSessionCommand(['notify', '2:3', 'running', '--prompt-source', 'user', '--handed', 'yes'])).toEqual({
      ok: true, command: { kind: 'notify', id: '2:3', state: 'running', told: { promptSource: 'user', handed: true } },
    });
    expect(parseSessionCommand(['notify', '2:3', 'running', '--last-message', 'x'])).toEqual({ ok: true, command: { kind: 'notify', id: '2:3', state: 'running' } });
    expect(parseSessionCommand(['notify', '2:3', 'done', '--last-message'])).toMatchObject({ ok: false });
    // A flag a later build's hook grows is read past.
    expect(parseSessionCommand(['notify', '2:3', 'done', '--mood', 'calm'])).toEqual({ ok: true, command: { kind: 'notify', id: '2:3', state: 'done' } });
  });

  it('reads report as a pane id', () => {
    expect(parseSessionCommand(['report', '2:3'])).toEqual({ ok: true, command: { kind: 'report', id: '2:3' } });
    expect(parseSessionCommand(['report'])).toMatchObject({ ok: false });
  });

  it('reads landed as a branch or a card, and refuses anything else', () => {
    expect(parseSessionCommand(['landed', '--branch', 'fix-it'])).toEqual({ ok: true, command: { kind: 'landed', by: 'branch', name: 'fix-it', from: null } });
    expect(parseSessionCommand(['landed', '--card', 'card-1', '--from', '2:1'])).toEqual({ ok: true, command: { kind: 'landed', by: 'card', name: 'card-1', from: '2:1' } });
    for (const words of [['landed'], ['landed', '--branch'], ['landed', 'fix-it'], ['landed', '--card', 'card-1', 'more'], ['landed', '--card', 'card-1', '--from', 'x']]) {
      expect(parseSessionCommand(words)).toMatchObject({ ok: false });
    }
  });
  it('answers nothing, or a word it does not know, with what it takes', () => {
    expect(parseSessionCommand([])).toMatchObject({ ok: false, message: expect.stringContaining('pane claim') });
    expect(parseSessionCommand(['spawn'])).toMatchObject({ ok: false, message: expect.stringMatching(/^no such command: spawn/) });
  });

  it('reads send as the pane and everything after it as the text, and refuses no text', () => {
    expect(parseSessionCommand(['send', '2:3', 'run', 'the', 'tests'])).toEqual({ ok: true, command: { kind: 'send', id: '2:3', text: 'run the tests' } });
    expect(parseSessionCommand(['send', '2:3'])).toEqual({ ok: false, message: 'pane send needs the text to type' });
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

  it('is read only the way each hook spells it', () => {
    expect(readsHookInput(['notify', '2:3', 'done', '--stop-input'])).toBe(true);
    expect(readsHookInput(['notify', '2:3', 'running', '--prompt-input'])).toBe(true);
    expect(readsHookInput(['notify', '2:3', 'running', '--stop-input'])).toBe(false);
    expect(readsHookInput(['notify', '2:3', 'done'])).toBe(false);
  });

  it('counts what the session still waits on, and sends its last message', () => {
    expect(stopInputArguments(input)).toEqual(['--background', '1', '--scheduled', '0', '--last-message', 'started']);
  });

  it('sends who put a prompt in', () => {
    expect(promptInputArguments(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hi', source: 'user' }))).toEqual(['--prompt-source', 'user']);
    expect(promptInputArguments(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }))).toEqual([]);
    const handed = 'fix it\n\nSendMessage to main-api when done, saying what you did.';
    expect(promptInputArguments(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: handed, source: 'sdk' })))
      .toEqual(['--prompt-source', 'sdk', '--handed', 'yes']);
  });

  it('sends nothing for input from an older Claude Code, or none that parses', () => {
    expect(stopInputArguments(JSON.stringify({ hook_event_name: 'Stop', background_tasks: [] }))).toEqual([]);
    expect(stopInputArguments('')).toEqual([]);
    expect(stopInputArguments('null')).toEqual([]);
  });

  it('sends the app the counts in place of the flag, and a notify the parser takes', () => {
    const sent = hookArguments(['notify', '2:3', 'done', '--stop-input'], input);
    expect(sent).toEqual(['notify', '2:3', 'done', '--background', '1', '--scheduled', '0', '--last-message', 'started']);
    expect(parseSessionCommand(sent).ok).toBe(true);
    expect(hookArguments(['notify', '2:3', 'done', '--stop-input'], undefined)).toEqual(['notify', '2:3', 'done']);
    expect(hookArguments(['list', '--all'], undefined)).toEqual(['list', '--all']);
  });

  // An app from before the last message is still sent the counts, which turn the pane.
  it('drops the words an older app refuses, and keeps the rest', () => {
    expect(olderNotifyArguments(['notify', '2:3', 'done', '--background', '1', '--scheduled', '0', '--last-message', 'started']))
      .toEqual(['notify', '2:3', 'done', '--background', '1', '--scheduled', '0']);
    expect(olderNotifyArguments(['notify', '2:3', 'running', '--prompt-source', 'user', '--handed', 'yes'])).toEqual(['notify', '2:3', 'running']);
    expect(olderNotifyArguments(['send', '2:3', '--last-message'])).toEqual(['send', '2:3', '--last-message']);
  });

  it('sends a notify again in older words only for a refusal of its words, and only when they differ', () => {
    const grown = ['notify', '2:3', 'done', '--last-message', 'started'];
    const older = olderNotifyArguments(grown);
    const refusal = parseSessionCommand(['notify', '2:3', 'done', '--background', 'two', '--scheduled', '0']);
    const wordsRefused = { ok: false, output: refusal.ok ? '' : refusal.message };
    // This build's spelling and the one before.
    expect(retriesInOlderWords(wordsRefused, grown, older)).toBe(true);
    expect(retriesInOlderWords({ ok: false, output: 'session notify takes nothing after its state, except --stop-input after done' }, grown, older)).toBe(true);
    expect(retriesInOlderWords(wordsRefused, older, older)).toBe(false);
    expect(retriesInOlderWords({ ok: false, output: '2:3 is not open' }, grown, older)).toBe(false);
    expect(retriesInOlderWords({ ok: true, output: '' }, grown, older)).toBe(false);
  });
});

describe('outsidePaneRefusal', () => {
  // A plain terminal has no project of its own: claiming in the folder it stands in would be a guess.
  it('refuses a claim that names no project, and lets everything that names its target through', () => {
    expect(outsidePaneRefusal({ kind: 'claim', project: null })).toContain('--project');
    expect(outsidePaneRefusal({ kind: 'claim', project: 'crm' })).toBeNull();
    expect(outsidePaneRefusal({ kind: 'send', id: '2:3', text: 'hi' })).toBeNull();
    expect(outsidePaneRefusal({ kind: 'conflicted', branch: 'fix-it', pullRequest: '12', from: null })).toContain('outside a Dashboard pane');
    expect(outsidePaneRefusal({ kind: 'list', all: true, reports: false })).toBeNull();
  });

  it('refuses landed, which no main outside a pane asks', () => {
    expect(outsidePaneRefusal({ kind: 'landed', by: 'branch', name: 'fix-it', from: null })).not.toBeNull();
  });
});

describe('landed from a command', () => {
  it('names the pane it ran in, when there is one', () => {
    expect(landedWords('branch', 'fix-it', '2:1')).toEqual(['landed', '--branch', 'fix-it', '--from', '2:1']);
    expect(landedWords('card', 'card-1', undefined)).toEqual(['landed', '--card', 'card-1']);
  });

  it('prints the app\'s lines, or the first line of why no worker was released', () => {
    expect(landedLine({ ok: true, output: 'released 2:1' })).toBe('released 2:1');
    expect(landedLine({ ok: true, output: '' })).toBe('');
    expect(landedLine({ ok: false, output: 'no such command: landed\n\npane — the Dashboard panes' })).toBe('no worker released: no such command: landed');
  });
});

describe('conflictedWords', () => {
  it('asks from the land\'s pane when there is one, and parses back', () => {
    expect(conflictedWords('fix-it', '12', '2:0')).toEqual(['conflicted', 'fix-it', '12', '--from', '2:0']);
    expect(parseSessionCommand(conflictedWords('fix-it', '12', undefined))).toEqual({ ok: true, command: { kind: 'conflicted', branch: 'fix-it', pullRequest: '12', from: null } });
  });

  // Handed only when the app named an agent: an empty answer or an older app's refusal waits on no push.
  it('reads the app\'s answer as handed, nobody on the branch, or refused', () => {
    expect(conflictedLine({ ok: true, output: 'sent /pr-conflicts 12 to 2:1' })).toEqual({ handed: true, line: 'sent /pr-conflicts 12 to 2:1' });
    expect(conflictedLine({ ok: true, output: '' })).toEqual({ handed: false, line: '' });
    expect(conflictedLine({ ok: false, output: 'no such command: conflicted\n\npane — the Dashboard panes' })).toEqual({ handed: false, line: 'conflict not handed on: no such command: conflicted' });
  });
});
