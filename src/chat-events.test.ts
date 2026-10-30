import { describe, expect, it } from 'vitest';
import { injectedMessage } from './chat-events';

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
      body: 'Status: completed\nOutput file: /tmp/x.output',
    });
  });

  it('unfolds a peer message with no body to what its envelope holds, keeping its own indentation', () => {
    const text = 'Another Claude session sent a message:\n<agent-message from="abc">Shard done.\n\n- a\n  - nested</agent-message>';
    expect(injectedMessage({ kind: 'peer', from: 'abc' }, text)).toEqual({ title: 'Message from abc', body: 'Shard done.\n\n- a\n  - nested' });
    expect(injectedMessage({ kind: 'peer', from: 'x', body: '- a\n  - nested' }, 'ignored')?.body).toBe('- a\n  - nested');
  });

  it('folds an empty kind rather than throwing', () => {
    expect(injectedMessage({ kind: '' }, 'hi')?.body).toBe('hi');
    expect(injectedMessage({ kind: 'task-notification', subkind: '' }, 'hi')?.title).toBe('');
  });

  it('folds a kind it does not know under its own name', () => {
    expect(injectedMessage({ kind: 'auto-continuation' }, ' go on ')).toEqual({ title: 'Auto continuation message', body: 'go on' });
    expect(injectedMessage({ kind: 'task-notification', subkind: 'scheduled-trigger' }, 'run it')?.title).toBe('Scheduled trigger');
  });
});
