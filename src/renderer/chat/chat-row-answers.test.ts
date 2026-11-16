import { describe, expect, it } from 'vitest';
import { rowAnswer, rowLines } from './chat-row-answers';
import { ELICITATION, type PermissionAsk } from '../../shared/chat/chat-elicitation';

const ask = (over: Partial<PermissionAsk> = {}): PermissionAsk => ({
  id: '1', toolName: 'Bash', input: { command: 'rm -rf build' }, defaultToNo: false, suppressAlwaysAllowRule: false, ...over,
});
const question = (multiSelect: boolean) => ({
  question: 'Which?', header: 'Pick', multiSelect, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }],
});

describe('rowLines', () => {
  it('prints a tool call with the digit for each answer that needs nothing typed', () => {
    expect(rowLines(ask())).toEqual(['Bash: rm -rf build', '1. Yes', '2. No']);
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
