import { describe, expect, it } from 'vitest';
import { hookFailure, runningHook } from './chat-hooks';
import { applyMessage, EMPTY_TRANSCRIPT } from './chat-transcript';

const hook = (subtype: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'system', subtype, hook_id: 'h', hook_name: 'PreToolUse:Bash', hook_event: 'PreToolUse', ...extra });

describe('runningHook', () => {
  it('names a hook when it starts and clears it once it answers', () => {
    expect(runningHook(hook('hook_started'))).toBe('PreToolUse:Bash');
    expect(runningHook(hook('hook_response', { outcome: 'success' }))).toBeNull();
  });

  it('says nothing about a message that is not about a hook', () => {
    expect(runningHook({ type: 'system', subtype: 'task_started' })).toBeUndefined();
  });
});

describe('hookFailure', () => {
  it('turns a failed hook into a line holding what it printed to stderr', () => {
    expect(hookFailure(hook('hook_response', { outcome: 'error', exit_code: 2, stderr: 'blocked: rm -rf\n', output: 'x' })))
      .toEqual({ title: 'PreToolUse:Bash hook failed (exit 2)', body: 'blocked: rm -rf' });
  });

  it('falls back to stdout when stderr is empty, and to the event when the hook has no name', () => {
    expect(hookFailure(hook('hook_response', { outcome: 'error', stderr: '', stdout: 'reason on stdout\n' })))
      .toEqual({ title: 'PreToolUse:Bash hook failed', body: 'reason on stdout' });
    expect(hookFailure({ type: 'system', subtype: 'hook_response', outcome: 'error', hook_event: 'Stop', stderr: 'x' })?.title)
      .toBe('Stop hook failed');
    expect(hookFailure({ type: 'system', subtype: 'hook_response', outcome: 'error', stderr: 'x' })?.title).toBe('hook hook failed');
  });

  it('leaves a hook that succeeded or was cancelled out of the conversation', () => {
    expect(hookFailure(hook('hook_response', { outcome: 'success' }))).toBeNull();
    expect(hookFailure(hook('hook_response', { outcome: 'cancelled' }))).toBeNull();
    expect(hookFailure(hook('hook_started'))).toBeNull();
  });
});

describe('a hook in the transcript', () => {
  it('is named while it runs, cleared when it answers, and a failure is folded into the conversation', () => {
    const running = applyMessage(EMPTY_TRANSCRIPT, hook('hook_started'));
    expect(running.hook).toBe('PreToolUse:Bash');
    const done = applyMessage(running, hook('hook_response', { outcome: 'error', stderr: 'no' }));
    expect(done.hook).toBeNull();
    expect(done.entries).toEqual([{ kind: 'event', title: 'PreToolUse:Bash hook failed', body: 'no', verbatim: true }]);
  });
});
