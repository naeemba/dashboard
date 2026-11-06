import { describe, expect, it } from 'vitest';
import { parseMerges, repositoryOf } from './vite.changelog';

const record = (...fields: string[]): string => `${fields.join('\x1f')}\x1e\n`;

describe('parseMerges', () => {
  it('reads the number from the subject and the title from the first line of the body', () => {
    const log = record('f5a53f7e00112233445566778899aabbccddeeff', '2026-11-06T17:00:00+03:30',
      'Merge pull request #219 from owner/branch', '\nOne place for the board\'s actions\n\nMore text');
    expect(parseMerges(log)).toEqual([{
      commit: 'f5a53f7e0011', time: '2026-11-06T17:00:00+03:30', pullRequest: 219, title: 'One place for the board\'s actions',
    }]);
  });

  it('falls back to the subject for a merge with no body, and skips a merge that is not a pull request', () => {
    const log = record('a'.repeat(40), '2026-11-06T17:00:00Z', 'Merge pull request #7 from owner/branch', '')
      + record('b'.repeat(40), '2026-11-06T17:00:00Z', "Merge branch 'main' into feature", 'Body');
    expect(parseMerges(log)).toEqual([{
      commit: 'a'.repeat(12), time: '2026-11-06T17:00:00Z', pullRequest: 7, title: 'Merge pull request #7 from owner/branch',
    }]);
  });

  it('reads an empty log as no entries', () => {
    expect(parseMerges('')).toEqual([]);
  });
});

describe('repositoryOf', () => {
  it('reads owner and name from an ssh alias and an https URL alike', () => {
    expect(repositoryOf('git@github.com-p:naeemba/dashboard.git\n')).toBe('naeemba/dashboard');
    expect(repositoryOf('https://github.com/naeemba/dashboard')).toBe('naeemba/dashboard');
    expect(repositoryOf('https://github.com/naeemba/dashboard.git')).toBe('naeemba/dashboard');
  });

  it('answers null for no origin', () => {
    expect(repositoryOf('')).toBeNull();
  });
});
