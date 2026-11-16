import { describe, expect, it } from 'vitest';
import { rowCall } from './chat-row-call';
import { CALL_WIDTH } from './chat-tools';
import type { PermissionAsk } from '../../shared/chat/chat-elicitation';

const ask = (toolName: string, input: Record<string, unknown>): PermissionAsk => ({
  id: '1', toolName, input, defaultToNo: false, suppressAlwaysAllowRule: false,
});

describe('rowCall', () => {
  it('names the tool and the command, path or URL it is about to use', () => {
    expect(rowCall(ask('Bash', { command: 'rm -rf build' }))).toBe('Bash: rm -rf build');
    expect(rowCall(ask('Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' }))).toBe('Edit: /etc/hosts');
    expect(rowCall(ask('WebFetch', { url: 'https://example.com', prompt: 'read it' }))).toBe('WebFetch: https://example.com');
  });

  it('keeps every line of a command, so a harmless first line cannot hide the rest', () => {
    expect(rowCall(ask('Bash', { command: 'echo ok\n  rm -rf ~\n' }))).toBe('Bash: echo ok ⏎ rm -rf ~');
  });

  it('cuts a long call with an ellipsis that shows it was cut', () => {
    const line = rowCall(ask('Bash', { command: 'x'.repeat(400) }));
    expect(line).toHaveLength(CALL_WIDTH);
    expect(line?.endsWith('…')).toBe(true);
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
