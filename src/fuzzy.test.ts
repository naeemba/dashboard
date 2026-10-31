import { describe, expect, it } from 'vitest';
import { fuzzyScore, ranked } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches letters in order with gaps between them', () => {
    expect(fuzzyScore('dashboard', 'dsb')).not.toBeNull();
    expect(fuzzyScore('dashboard', 'bsd')).toBeNull();
  });

  it('matches everything when the query is empty', () => {
    expect(fuzzyScore('dashboard', '')).toBe(0);
  });

  it('scores a tighter match lower', () => {
    expect(fuzzyScore('dashboard', 'boa')).toBeLessThan(fuzzyScore('dashboard', 'dad') as number);
  });

  it('ignores case and spaces in the query', () => {
    expect(fuzzyScore('/code/API', 'a p i')).toBe(fuzzyScore('/code/api', 'API'));
  });
});

describe('ranked', () => {
  it('keeps every item in order for an empty query and the matches best first otherwise', () => {
    expect(ranked(['low', 'high', 'xhigh'], (each) => each, '')).toEqual(['low', 'high', 'xhigh']);
    expect(ranked(['xhigh', 'low', 'high'], (each) => each, 'hi')).toEqual(['xhigh', 'high']);
  });
});
