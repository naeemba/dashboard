import { describe, expect, it } from 'vitest';
import { rowCall } from './chat-row-call';
import { CALL_WIDTH } from './chat-tools';
import type { PermissionAsk } from '../../shared/chat/chat-elicitation';

const ask = (toolName: string, input: Record<string, unknown>): PermissionAsk => ({
  id: '1', toolName, input, defaultToNo: false, suppressAlwaysAllowRule: false,
});

const line = (toolName: string, input: Record<string, unknown>) => rowCall(ask(toolName, input))?.line;

describe('rowCall', () => {
  it('names the tool and the command, path or URL it is about to use', () => {
    expect(rowCall(ask('Bash', { command: 'rm -rf build' }))).toEqual({ line: 'Bash: rm -rf build', whole: true });
    expect(line('Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' })).toBe('Edit: /etc/hosts');
    expect(line('WebFetch', { url: 'https://example.com', prompt: 'read it' })).toBe('WebFetch: https://example.com');
  });

  it('keeps every line of a command, so a harmless first line cannot hide the rest', () => {
    expect(line('Bash', { command: 'echo ok\n  rm -rf ~\n' })).toBe('Bash: echo ok ⏎ rm -rf ~');
  });

  // The danger at the end is what the cut hides, so the cut call is shown but not whole.
  it('cuts a long call with an ellipsis and says it is not whole', () => {
    const call = rowCall(ask('Bash', { command: `cd x && ${'echo fine; '.repeat(15)}&& rm -rf ~` }));
    expect(call?.whole).toBe(false);
    expect(call?.line).toHaveLength(CALL_WIDTH);
    expect(call?.line.endsWith('…')).toBe(true);
    expect(call?.line).not.toContain('rm -rf');
  });

  it('is whole at exactly the width of the row', () => {
    expect(rowCall(ask('Bash', { command: 'x'.repeat(CALL_WIDTH - 'Bash: '.length) }))?.whole).toBe(true);
  });

  it('is null for a call the row cannot show, so no digit answers it', () => {
    expect(rowCall(ask('ExitPlanMode', { plan: 'Rewrite everything' }))).toBeNull();
    expect(rowCall(ask('Agent', { description: 'tidy', prompt: 'delete the tests' }))).toBeNull();
    expect(rowCall(ask('mcp__github__merge', { owner: 'me', repository: 'app' }))).toBeNull();
    expect(rowCall(ask('Bash', {}))).toBeNull();
    expect(rowCall(ask('Bash', { command: '   ' }))).toBeNull();
    expect(rowCall(ask('constructor', { command: 'rm -rf ~' }))).toBeNull();
  });
});
