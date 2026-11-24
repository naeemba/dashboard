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
  it('takes the current branch\'s upstream when it is a remote', () => {
    expect(chosenRemote('gitlab', ['origin', 'gitlab'])).toBe('gitlab');
  });

  it('takes the only remote when the upstream is none, or a local branch', () => {
    expect(chosenRemote(null, ['gitlab'])).toBe('gitlab');
    expect(chosenRemote('.', ['gitlab'])).toBe('gitlab');
  });

  it('falls back to origin among several, or none', () => {
    expect(chosenRemote(null, ['origin', 'gitlab'])).toBe('origin');
    expect(chosenRemote(null, [])).toBe('origin');
  });
});
