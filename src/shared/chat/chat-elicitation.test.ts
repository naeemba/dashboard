import { describe, expect, it } from 'vitest';
import { DECLINED, elicitationAsk, elicitationResult, elicitationTitle, fieldAbout, fieldChoices, fieldsOf, takes, typedValue } from './chat-elicitation';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Your name', default: 'Ada' },
    age: { type: 'integer' },
    subscribe: { type: 'boolean', description: 'Weekly mail' },
    size: { type: 'string', enum: ['s', 'l'], enumNames: ['Small', 'Large'] },
    colour: { type: 'string', oneOf: [{ const: 'r', title: 'Red' }] },
    labels: { type: 'array', items: { enum: ['bug', 'ui'] } },
    count: { type: 'integer', minimum: 1, maximum: 9 },
    code: { type: 'string', minLength: 3 },
  },
  required: ['name', 'age'],
};

describe('fieldsOf', () => {
  it('reads each property as a field of its kind', () => {
    const fields = fieldsOf(schema);
    expect(fields.map((field) => [field.key, field.kind, field.required])).toEqual([
      ['name', 'text', true], ['age', 'integer', true], ['subscribe', 'boolean', false], ['size', 'choice', false], ['colour', 'choice', false],
      ['labels', 'list', false], ['count', 'integer', false], ['code', 'text', false],
    ]);
    expect(fields[0]).toMatchObject({ label: 'Your name', initial: 'Ada' });
    expect(fields[3].options).toEqual([{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }]);
    expect(fields[4].options).toEqual([{ value: 'r', label: 'Red' }]);
  });

  it('reads no fields from a schema with no properties', () => {
    expect(fieldsOf(undefined)).toEqual([]);
    expect(fieldsOf({ type: 'object' })).toEqual([]);
  });
});

const [name, age, subscribe, size, , labels, count, code] = fieldsOf(schema);
const labelsOf = (field: typeof name) => fieldChoices(field).choices.map((choice) => choice.label);

describe('fieldChoices', () => {
  it('asks a yes or no and a pick as rows, with Skip only where the field may be left out', () => {
    expect(labelsOf(subscribe)).toEqual(['Yes', 'No', 'Skip', 'Decline']);
    expect(labelsOf(size)).toEqual(['Small', 'Large', 'Skip', 'Decline']);
    expect(labelsOf({ ...size, required: true })).toEqual(['Small', 'Large', 'Decline']);
  });

  it('opens on the default the server gave', () => {
    expect(fieldChoices({ ...subscribe, initial: 'false' }).start).toBe(1);
    expect(fieldChoices({ ...size, initial: 'l' }).start).toBe(1);
    expect(fieldChoices(size).start).toBe(0);
  });

  it('types the rest, saying what it takes, and only skips or declines a list', () => {
    expect(fieldChoices(age).choices).toEqual([{ label: 'age', typed: 'A whole number, then Enter' }, { label: 'Decline', decline: true }]);
    expect(fieldChoices(count).choices[0]).toEqual({ label: 'count', typed: 'A whole number of 1 to 9, or leave it empty, then Enter' });
    expect(labelsOf(labels)).toEqual(['Skip', 'Decline']);
    expect(labelsOf({ ...labels, required: true })).toEqual(['Decline']);
    expect(fieldAbout(labels)).toContain('cannot be answered from here');
    expect(fieldAbout(subscribe)).toBe('subscribe (optional) — Weekly mail');
  });

  it('says the bounds a typed field has', () => {
    expect(takes(code)).toBe('Text of at least 3 characters');
    expect(takes({ ...count, limits: { ...count.limits, minimum: -Infinity } })).toBe('A whole number of at most 9');
    expect(takes({ ...count, limits: { ...count.limits, maximum: Infinity, minimum: 0 } })).toBe('A whole number of at least 0');
    expect(takes({ ...code, limits: { ...code.limits, minLength: 0, maxLength: 9 } })).toBe('Text of at most 9 characters');
  });
});

describe('typedValue', () => {
  const note = { ...name, required: false };

  it('keeps a required field open until something is typed', () => {
    expect(typedValue(name, '')).toBe('again');
    expect(typedValue(note, '')).toBe('skip');
  });

  it('takes a number only where it is one', () => {
    expect(typedValue(age, '41')).toEqual({ value: 41 });
    expect(typedValue(age, '4.5')).toBe('again');
    expect(typedValue(age, 'old')).toBe('again');
    expect(typedValue(name, '41')).toEqual({ value: '41' });
  });

  it('keeps the box open on an answer outside the bounds', () => {
    expect(typedValue(count, '0')).toBe('again');
    expect(typedValue(count, '9')).toEqual({ value: 9 });
    expect(typedValue(code, 'ab')).toBe('again');
    expect(typedValue(code, 'abc')).toEqual({ value: 'abc' });
  });
});

describe('elicitationResult', () => {
  const form = { serverName: 'crm', message: 'Who are you?', mode: 'form' as const };

  it('accepts a form with what was filled in, and declines on a no', () => {
    expect(elicitationResult(form, { behavior: 'allow', updatedInput: { name: 'Ada' } })).toEqual({ action: 'accept', content: { name: 'Ada' } });
    expect(elicitationResult(form, DECLINED)).toEqual({ action: 'decline' });
  });

  it('cancels when the ask is given up on rather than declined', () => {
    expect(elicitationResult(form, { behavior: 'deny', message: 'Interrupted.' })).toEqual({ action: 'cancel' });
    expect(elicitationResult(form, { behavior: 'deny', message: 'The session ended.' })).toEqual({ action: 'cancel' });
  });

  it('carries the server subtitle onto the ask', () => {
    expect(elicitationAsk({ ...form, description: 'Signs you in' }).description).toBe('Signs you in');
  });

  it('accepts a link with no content', () => {
    expect(elicitationResult({ ...form, mode: 'url' }, { behavior: 'allow', updatedInput: {} })).toEqual({ action: 'accept' });
  });

  it('titles the ask with the server and its message', () => {
    expect(elicitationTitle(form)).toBe('crm: Who are you?');
  });
});
