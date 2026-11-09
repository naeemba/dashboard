import { describe, expect, it } from 'vitest';
import { formatMemory, memoryText, nearHigh } from './scope-memory';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

describe('formatMemory', () => {
  it('prints gigabytes to one place and megabytes whole', () => {
    expect(formatMemory(2.1 * GIB)).toBe('2.1G');
    expect(formatMemory(640 * MIB)).toBe('640M');
  });

  it('prints at least 1M for a scope holding anything, and nothing for no reading', () => {
    expect(formatMemory(4096)).toBe('1M');
    expect(formatMemory(undefined)).toBe('');
  });
});

describe('nearHigh', () => {
  it('marks a capped scope from 80% of its MemoryHigh', () => {
    expect(nearHigh({ bytes: 4.7 * GIB, high: 6 * GIB })).toBe(false);
    expect(nearHigh({ bytes: 4.9 * GIB, high: 6 * GIB })).toBe(true);
  });

  it('never marks an uncapped scope, however big', () => {
    expect(nearHigh({ bytes: 30 * GIB, high: null })).toBe(false);
    expect(nearHigh(undefined)).toBe(false);
  });
});

describe('memoryText', () => {
  it('names the cap beside the figure once it is near', () => {
    expect(memoryText({ bytes: 2.1 * GIB, high: 6 * GIB })).toBe('2.1G');
    expect(memoryText({ bytes: 5.1 * GIB, high: 6 * GIB })).toBe('5.1G of 6G');
    expect(memoryText(undefined)).toBe('');
  });
});
