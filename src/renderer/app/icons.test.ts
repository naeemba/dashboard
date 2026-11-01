import { describe, expect, it } from 'vitest';
import { columnIcon } from './icons';

describe('columnIcon', () => {
  it('knows the shipped columns whatever their case', () => {
    expect(columnIcon('Todo')).toBe('todo');
    expect(columnIcon(' REVIEW ')).toBe('review');
  });

  it('gives a column it does not know the plain board icon', () => {
    expect(columnIcon('Icebox')).toBe('board');
  });
});
