import { describe, expect, it } from 'vitest';
import { drawnMemory, memoryText, nearHigh } from './scope-memory';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

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
    expect(memoryText({ bytes: 2.1 * GIB, high: 6 * GIB })).toBe('2.1 GB');
    expect(memoryText({ bytes: 640 * MIB, high: null })).toBe('640 MB');
    expect(memoryText({ bytes: 5.1 * GIB, high: 6 * GIB })).toBe('5.1 GB of 6.0 GB');
    expect(memoryText(undefined)).toBe('');
  });
});

describe('drawnMemory', () => {
  it('is the same for two readings that draw the same, and differs once a figure moves', () => {
    expect(drawnMemory({ '3:1': { bytes: 2.10 * GIB, high: null } })).toBe(drawnMemory({ '3:1': { bytes: 2.11 * GIB, high: null } }));
    expect(drawnMemory({ '3:1': { bytes: 2.1 * GIB, high: null } })).not.toBe(drawnMemory({ '3:1': { bytes: 2.3 * GIB, high: null } }));
  });

  it('does not depend on the order the reads finished in', () => {
    const one = { bytes: GIB, high: null };
    const two = { bytes: 2 * GIB, high: null };
    expect(drawnMemory({ '3:1': one, '3:2': two })).toBe(drawnMemory({ '3:2': two, '3:1': one }));
  });
});
