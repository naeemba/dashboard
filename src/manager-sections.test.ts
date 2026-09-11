import { describe, expect, it } from 'vitest';
import { SECTIONS, nextSectionMode, sectionIndex } from './manager-sections';

describe('SECTIONS', () => {
  it('is the order the strip prints, general first', () => {
    expect(SECTIONS.map((section) => section.name)).toEqual(['general', 'board', 'command']);
  });
});

describe('sectionIndex', () => {
  it('finds the section a mode is showing', () => {
    expect(sectionIndex('manager')).toBe(0);
    expect(sectionIndex('command')).toBe(2);
  });

  it('answers -1 for a mode that is no section of the manager', () => {
    expect(sectionIndex('terminals')).toBe(-1);
    expect(sectionIndex('nvim')).toBe(-1);
  });
});

describe('nextSectionMode', () => {
  it('walks right and left along the strip', () => {
    expect(nextSectionMode('manager', 'next')).toBe('board');
    expect(nextSectionMode('board', 'next')).toBe('command');
    expect(nextSectionMode('command', 'previous')).toBe('board');
  });

  it('does not wrap at either end', () => {
    expect(nextSectionMode('manager', 'previous')).toBe('manager');
    expect(nextSectionMode('command', 'next')).toBe('command');
  });

  it('leaves a mode that is no section of the manager where it is', () => {
    expect(nextSectionMode('terminals', 'next')).toBe('terminals');
  });
});
