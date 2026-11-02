import { describe, expect, it } from 'vitest';
import { defaultBranch } from './default-branch';

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
