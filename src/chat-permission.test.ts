import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { declined, permissionChoices, permissionTitle, questionAnswer, questionsOf, type PermissionAsk } from './chat-permission';

const ask = (over: Partial<PermissionAsk> = {}): PermissionAsk => ({
  id: '1', toolName: 'Bash', input: { command: 'rm -rf build' }, defaultToNo: false, suppressAlwaysAllowRule: false, ...over,
});
const rule: PermissionUpdate = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' };

describe('permissionChoices', () => {
  it('offers yes and no, opening on yes', () => {
    const { choices, start } = permissionChoices(ask());
    expect(choices.map((choice) => choice.label)).toEqual(['Yes', 'No', 'No, and say what to do instead']);
    expect(start).toBe(0);
  });

  it('offers always when the session sent rules to add', () => {
    const { choices } = permissionChoices(ask({ suggestions: [rule] }));
    expect(choices[1].result).toEqual({ behavior: 'allow', updatedInput: { command: 'rm -rf build' }, updatedPermissions: [rule] });
  });

  it('leaves always out when the rule would grant more than this call', () => {
    const { choices } = permissionChoices(ask({ suggestions: [rule], suppressAlwaysAllowRule: true }));
    expect(choices.map((choice) => choice.label)).not.toContain('Yes, and do not ask again for this');
  });

  it('opens on No when the session asks for it', () => {
    const { choices, start } = permissionChoices(ask({ defaultToNo: true, suggestions: [rule] }));
    expect(choices[start]).toMatchObject({ label: 'No', result: { behavior: 'deny' } });
  });

  it('puts a plan up for approval, each yes leaving plan mode for a mode of its own', () => {
    const { choices } = permissionChoices(ask({ toolName: 'ExitPlanMode', input: { plan: '1. do it' } }));
    expect(choices.map((choice) => choice.result.behavior === 'allow' && choice.result.updatedPermissions)).toEqual([
      [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
      [{ type: 'setMode', mode: 'default', destination: 'session' }],
      false,
    ]);
    expect(choices[2]).toMatchObject({ label: 'No, keep planning', typed: true });
  });
});

describe('declined', () => {
  it('passes on what was typed as the reason', () => {
    expect(declined(' use pnpm ')).toEqual({ behavior: 'deny', message: 'The user said no to this tool call: use pnpm' });
  });
  it('is the plain no when nothing was', () => {
    expect(declined('')).toEqual({ behavior: 'deny', message: 'The user said no to this tool call.' });
  });
});

describe('permissionTitle', () => {
  it('prefers the sentence the session sent', () => {
    expect(permissionTitle(ask({ title: 'Claude wants to run rm' }))).toBe('Claude wants to run rm');
  });

  it('falls back to the tool and what it touches', () => {
    expect(permissionTitle(ask())).toBe('Bash: rm -rf build');
  });
});

describe('questionAnswer', () => {
  const input = {
    questions: [
      { question: 'Which?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }] },
      { question: 'Which more?', header: 'More', multiSelect: true, options: [{ label: 'X', description: '' }, { label: 'Y', description: '' }] },
    ],
  };

  it('reads the questions', () => {
    expect(questionsOf(input).map((question) => question.multiSelect)).toEqual([false, true]);
  });

  it('answers question text to label, joining a multi-select with a comma', () => {
    expect(questionAnswer(input, [['B'], ['X', 'Y']])).toEqual({
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Which?': 'B', 'Which more?': 'X, Y' } },
    });
  });

  it('reads nothing out of an input with no questions', () => {
    expect(questionsOf({})).toEqual([]);
  });
});
