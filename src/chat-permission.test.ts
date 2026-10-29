import { describe, expect, it } from 'vitest';
import { permissionChoices, permissionTitle, questionAnswer, questionsOf, type PermissionAsk } from './chat-permission';

const ask = (over: Partial<PermissionAsk> = {}): PermissionAsk => ({
  id: '1', toolName: 'Bash', input: { command: 'rm -rf build' }, defaultToNo: false, suppressAlwaysAllowRule: false, ...over,
});
const rule = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' } as const;

describe('permissionChoices', () => {
  it('offers yes and no, opening on yes', () => {
    const { choices, start } = permissionChoices(ask());
    expect(choices.map((choice) => choice.label)).toEqual(['Yes', 'No']);
    expect(start).toBe(0);
  });

  it('offers always when the session sent rules to add', () => {
    const { choices } = permissionChoices(ask({ suggestions: [rule] }));
    expect(choices[1].result).toEqual({ behavior: 'allow', updatedInput: { command: 'rm -rf build' }, updatedPermissions: [rule] });
  });

  it('leaves always out when the rule would grant more than this call', () => {
    const { choices } = permissionChoices(ask({ suggestions: [rule], suppressAlwaysAllowRule: true }));
    expect(choices.map((choice) => choice.label)).toEqual(['Yes', 'No']);
  });

  it('opens on No when the session asks for it', () => {
    const { choices, start } = permissionChoices(ask({ defaultToNo: true, suggestions: [rule] }));
    expect(choices[start].result.behavior).toBe('deny');
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
