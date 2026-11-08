import { describe, expect, it } from 'vitest';
import { errorDetail, STACK_LIMIT } from './log-error';

describe('errorDetail', () => {
  it('reads an Error\'s name, message, stack and code', () => {
    const thrown = Object.assign(new TypeError('boom'), { code: 'ENOENT' });
    expect(errorDetail(thrown)).toEqual({ name: 'TypeError', message: 'boom', stack: thrown.stack, code: 'ENOENT' });
  });
  it('follows a cause chain, each in the same shape', () => {
    const root = new Error('disk full');
    const thrown = new Error('Board not saved', { cause: new Error('write failed', { cause: root }) });
    expect(errorDetail(thrown)?.cause?.message).toBe('write failed');
    expect(errorDetail(thrown)?.cause?.cause).toEqual({ name: 'Error', message: 'disk full', stack: root.stack });
  });
  it('stops a cause that is itself', () => {
    const thrown = new Error('loop');
    Object.assign(thrown, { cause: thrown });
    let depth = 0;
    for (let at = errorDetail(thrown); at !== undefined; at = at.cause) depth++;
    expect(depth).toBe(5);
  });
  it('cuts a stack to size', () => {
    const thrown = new Error('deep');
    thrown.stack = `Error: deep\n${'    at frame\n'.repeat(10_000)}`;
    expect(errorDetail(thrown)?.stack).toHaveLength(STACK_LIMIT + 1);
    expect(errorDetail(thrown)?.stack?.endsWith('…')).toBe(true);
  });
  it('reads a thrown string or number as its message, and nothing as nothing', () => {
    expect(errorDetail('no free pane')).toEqual({ message: 'no free pane' });
    expect(errorDetail(42)).toEqual({ message: '42' });
    expect(errorDetail(undefined)).toBeUndefined();
    expect(errorDetail(null)).toBeUndefined();
  });
  it('reads a numeric code as text', () => {
    expect(errorDetail({ message: 'refused', code: 7 })).toEqual({ message: 'refused', code: '7' });
  });
});
