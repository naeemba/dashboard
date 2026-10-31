import { describe, expect, it } from 'vitest';
import { injectedMessage, notTypedMessage } from './chat-events';

describe('injectedMessage', () => {
  it('leaves a typed message, and one with no origin, as the person\'s own', () => {
    expect(injectedMessage({ kind: 'human' }, 'hi')).toBeNull();
    expect(injectedMessage(undefined, '<task-notification><summary>x</summary></task-notification>')).toBeNull();
  });

  it('names a finished background task by its summary and unfolds to its result', () => {
    const text = '<task-notification>\n<summary>Agent "Review" finished</summary>\n<result>All -&gt; good</result>\n</task-notification>';
    expect(injectedMessage({ kind: 'task-notification' }, text)).toEqual({ title: 'Agent "Review" finished', body: 'All -> good' });
  });

  it('names a subagent\'s report by its sender and unfolds to the report alone', () => {
    const origin = { kind: 'peer', from: 'a12', name: 'general-purpose', body: '[Subagent hand-back] preamble. The report follows:\n  line one\n  line two' };
    expect(injectedMessage(origin, 'ignored')).toEqual({ title: 'Message from general-purpose', body: 'line one\nline two' });
  });

  it('unfolds a background command with no result to its status and output file, without the reminder after it', () => {
    const text = '<task-notification>\n<task-id>bnv</task-id>\n<output-file>/tmp/x.output</output-file>\n<status>completed</status>\n'
      + '<summary>Background command "wait" completed (exit code 0)</summary>\n</task-notification>\n<system-reminder>{"a":1}</system-reminder>';
    expect(injectedMessage({ kind: 'task-notification' }, text)).toEqual({
      title: 'Background command "wait" completed (exit code 0)',
      body: 'Output file: /tmp/x.output\n\nStatus: completed',
    });
  });

  it('unfolds a notification with only a summary to nothing, and a Monitor event or stopped workflow to every tag but its plumbing', () => {
    const review = '<task-notification>\n<summary>Commit security review found: X</summary>\n</task-notification>';
    expect(injectedMessage({ kind: 'task-notification' }, review)).toEqual({ title: 'Commit security review found: X', body: '' });
    const monitor = '<task-notification>\n<task-id>m1</task-id>\n<summary>Monitor event: "cancel CI runs"</summary>\n'
      + '<event>cancelled run 394 (PR #907): conflicting</event>\n</task-notification>';
    expect(injectedMessage({ kind: 'task-notification' }, monitor)?.body).toBe('Event: cancelled run 394 (PR #907): conflicting');
    const stopped = '<task-notification>\n<status>stopped</status>\n<note>No completion record was found</note>\n</task-notification>';
    expect(injectedMessage({ kind: 'task-notification' }, stopped)?.body).toBe('Status: stopped\n\nNote: No completion record was found');
  });

  it('unfolds a peer message with no body to what its envelope holds, keeping its own indentation', () => {
    const text = 'Another Claude session sent a message:\n<agent-message from="abc">Shard done.\n\n- a\n  - nested</agent-message>';
    expect(injectedMessage({ kind: 'peer', from: 'abc' }, text)).toEqual({ title: 'Message from abc', body: 'Shard done.\n\n- a\n  - nested' });
    expect(injectedMessage({ kind: 'peer', from: 'x', body: '- a\n  - nested' }, 'ignored')?.body).toBe('- a\n  - nested');
  });

  it('folds an empty kind rather than throwing', () => {
    expect(injectedMessage({ kind: '' }, 'hi')).toEqual({ title: 'A message', body: 'hi' });
    expect(injectedMessage({ kind: 'task-notification', subkind: '' }, 'hi')?.title).toBe('A background task finished');
  });

  it('folds a kind it does not know under its own name', () => {
    expect(injectedMessage({ kind: 'auto-continuation' }, ' go on ')).toEqual({ title: 'Auto continuation message', body: 'go on' });
    expect(injectedMessage({ kind: 'task-notification', subkind: 'scheduled-trigger' }, 'run it')?.title).toBe('Scheduled trigger');
  });
});

describe('notTypedMessage', () => {
  const meta = (text: string, skill?: string) => notTypedMessage(undefined, true, text, { skill });

  it('leaves an unmarked message as the person\'s own', () => {
    expect(notTypedMessage(undefined, false, 'Review the diff.', undefined)).toBeNull();
  });

  it('folds a loaded skill under its name, from the call or from its directory', () => {
    expect(meta('`/simplify` review the diff', 'simplify')).toEqual({ title: 'simplify skill', body: '`/simplify` review the diff' });
    expect(meta('Base directory for this skill: C:\\plugins\\skills\\model-product\n\n# Model')).toMatchObject({ title: 'model-product skill' });
  });

  it('folds plain instructions, a command prompt or a wake-up, as Instructions', () => {
    expect(meta('Capture this as a card on the board.')).toEqual({ title: 'Instructions', body: 'Capture this as a card on the board.' });
  });

  it('starts a turn with instructions answering no call, such as a wake-up, but not with a skill\'s', () => {
    expect(notTypedMessage(undefined, true, 'Check CI again.', undefined)).toEqual({ title: 'Instructions', body: 'Check CI again.', startsTurn: true });
    expect(notTypedMessage(undefined, true, 'steps', { skill: 'simplify' })).not.toHaveProperty('startsTurn');
    expect(notTypedMessage(undefined, true, '<system-reminder>x</system-reminder>', undefined)).toBe('hidden');
  });

  it('hides what is only plumbing: pasted image sources, a reminder, a local command\'s caveat', () => {
    expect(meta('[Image: source: /tmp/1.png]\n[Image: source: /tmp/2.png]')).toBe('hidden');
    expect(meta('<system-reminder>x</system-reminder>')).toBe('hidden');
    expect(meta('<local-command-caveat>Run directly.</local-command-caveat>')).toBe('hidden');
  });
});
