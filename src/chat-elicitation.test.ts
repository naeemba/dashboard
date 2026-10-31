import { describe, expect, it } from 'vitest';
import { elicitationResult, elicitationTitle, fieldsOf, typedValue } from './chat-elicitation';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Your name', default: 'Ada' },
    age: { type: 'integer' },
    subscribe: { type: 'boolean', description: 'Weekly mail' },
    size: { type: 'string', enum: ['s', 'l'], enumNames: ['Small', 'Large'] },
    colour: { type: 'string', oneOf: [{ const: 'r', title: 'Red' }] },
  },
  required: ['name', 'age'],
};

describe('fieldsOf', () => {
  it('reads each property as a field of its kind', () => {
    const fields = fieldsOf(schema);
    expect(fields.map((field) => [field.key, field.kind, field.required])).toEqual([
      ['name', 'text', true], ['age', 'integer', true], ['subscribe', 'boolean', false], ['size', 'choice', false], ['colour', 'choice', false],
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

describe('typedValue', () => {
  const [name, age] = fieldsOf(schema);
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
});

describe('elicitationResult', () => {
  const form = { serverName: 'crm', message: 'Who are you?', mode: 'form' as const };

  it('accepts a form with what was filled in, and declines on a no', () => {
    expect(elicitationResult(form, { behavior: 'allow', updatedInput: { name: 'Ada' } })).toEqual({ action: 'accept', content: { name: 'Ada' } });
    expect(elicitationResult(form, { behavior: 'deny', message: 'no' })).toEqual({ action: 'decline' });
  });

  it('accepts a link with no content', () => {
    expect(elicitationResult({ ...form, mode: 'url' }, { behavior: 'allow', updatedInput: {} })).toEqual({ action: 'accept' });
  });

  it('titles the ask with the server and its message', () => {
    expect(elicitationTitle(form)).toBe('crm: Who are you?');
  });
});
