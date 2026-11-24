import { describe, expect, it } from 'vitest';
import { chosenRemote, defaultBranch } from './default-branch';

describe('defaultBranch', () => {
  it('takes <remote>/HEAD, sliced rather than matched', () => {
    expect(defaultBranch('a.b', 'a.b/trunk', () => false)).toBe('trunk');
  });

  it('falls back to main, then master', () => {
    expect(defaultBranch('origin', null, (name) => name === 'master')).toBe('master');
    expect(defaultBranch('origin', null, () => true)).toBe('main');
  });

  it('answers null when the remote has neither', () => {
    expect(defaultBranch('origin', null, () => false)).toBeNull();
  });
});

describe('chosenRemote', () => {
  it('takes origin whenever there is one, whatever the local main tracks', () => {
    expect(chosenRemote(['upstream', 'origin'], ['upstream', null])).toBe('origin');
  });

  it('takes the only remote', () => {
    expect(chosenRemote(['gitlab'], [null, null])).toBe('gitlab');
  });

  it('takes the remote the local main, then master, tracks among several without origin', () => {
    expect(chosenRemote(['gitlab', 'mirror'], ['.', 'mirror'])).toBe('mirror');
    expect(chosenRemote(['gitlab', 'mirror'], ['gitlab', 'mirror'])).toBe('gitlab');
  });

  it('falls back to origin among several with no tracked default, or none', () => {
    expect(chosenRemote(['gitlab', 'mirror'], [null, null])).toBe('origin');
    expect(chosenRemote([], [null, null])).toBe('origin');
  });
});
