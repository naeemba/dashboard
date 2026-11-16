import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { rowAnswer, rowLines, takesDigit } from './chat-row-answers';
import { ELICITATION, type PermissionAsk } from '../../shared/chat/chat-elicitation';

const ask = (overrides: Partial<PermissionAsk> = {}): PermissionAsk => ({
  id: '1', toolName: 'Bash', input: { command: 'rm -rf build' }, defaultToNo: false, suppressAlwaysAllowRule: false, ...overrides,
});
const suggestions: PermissionUpdate[] = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }];
const question = (multiSelect: boolean) => ({
  question: 'Which?', header: 'Pick', multiSelect, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }],
});

describe('rowLines', () => {
  it('prints a tool call with the digit for each answer that needs nothing typed', () => {
    expect(rowLines(ask())).toEqual(['Bash: rm -rf build', '1. Yes', '2. No']);
  });

  // An "always" rule from the session goes second, so No moves down to 3.
  it('numbers the always row second when the session sent rules', () => {
    expect(rowLines(ask({ suggestions: suggestions }))).toEqual([
      'Bash: rm -rf build', '1. Yes', '2. Yes, and do not ask again for this', '3. No',
    ]);
  });

  it('prints a lone question by its own text and options', () => {
    expect(rowLines(ask({ toolName: 'AskUserQuestion', input: { questions: [question(false)] } }))).toEqual(['Which?', '1. A', '2. B']);
  });

  it('prints only the title for what the screen has to answer itself', () => {
    expect(rowLines(ask({ toolName: 'AskUserQuestion', input: { questions: [question(true)] } }))).toEqual(['Which?']);
    expect(rowLines(ask({ toolName: ELICITATION, title: 'Sign in' }))).toEqual(['Sign in']);
  });
});

describe('rowAnswer', () => {
  it('answers a tool call by its digit', () => {
    expect(rowAnswer(ask(), '1')).toEqual({ behavior: 'allow', updatedInput: { command: 'rm -rf build' } });
    expect(rowAnswer(ask(), '2')).toMatchObject({ behavior: 'deny' });
  });

  it('gives the always rule on 2 and declines on 3 when the session sent rules', () => {
    const withRules = ask({ suggestions: suggestions });
    expect(rowAnswer(withRules, '2')).toMatchObject({ behavior: 'allow', updatedPermissions: suggestions });
    expect(rowAnswer(withRules, '3')).toMatchObject({ behavior: 'deny' });
  });

  it('answers a lone question with the option picked', () => {
    const input = { questions: [question(false)] };
    expect(rowAnswer(ask({ toolName: 'AskUserQuestion', input }), '2')).toEqual({
      behavior: 'allow', updatedInput: { ...input, answers: { 'Which?': 'B' } },
    });
  });

  it('takes no key that is not an offered digit', () => {
    expect(rowAnswer(ask(), '3')).toBeNull();
    expect(rowAnswer(ask(), 'y')).toBeNull();
    expect(rowAnswer(ask(), '0')).toBeNull();
  });
});

describe('takesDigit', () => {
  it('is true where the row lists a digit, and false where the screen has to answer itself', () => {
    expect(takesDigit(ask())).toBe(true);
    expect(takesDigit(ask({ toolName: 'AskUserQuestion', input: { questions: [question(true)] } }))).toBe(false);
    expect(takesDigit(ask({ toolName: ELICITATION, title: 'Sign in' }))).toBe(false);
  });
});
