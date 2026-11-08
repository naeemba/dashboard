import { describe, expect, it } from 'vitest';
import { afterWatch, mainRefusal } from './release-checks.mjs';

describe('mainRefusal', () => {
  it('lets a bump and a resume through on a clean main equal to origin/main', () => {
    expect(mainRefusal('bump', 'main', 'clean', 'same')).toBe('');
    expect(mainRefusal('resume', 'main', 'clean', 'same')).toBe('');
  });

  it('lets a resume through when origin/main is ahead by the release commit', () => {
    expect(mainRefusal('resume', 'main', 'clean', 'behind')).toBe('');
  });

  it('refuses a bump behind origin/main', () => {
    expect(mainRefusal('bump', 'main', 'clean', 'behind')).toBe('main is not origin/main. Pull or push until they match.');
  });

  it('refuses either with commits origin/main does not have', () => {
    expect(mainRefusal('bump', 'main', 'clean', 'other')).toBe('main is not origin/main. Pull or push until they match.');
    expect(mainRefusal('resume', 'main', 'clean', 'other')).toBe('main has commits origin/main does not. Push or drop them, then resume.');
  });

  it('refuses either on a dirty tree, even when origin/main is only ahead', () => {
    expect(mainRefusal('resume', 'main', 'dirty', 'behind')).toBe('main has uncommitted changes. Commit or remove them first.');
    expect(mainRefusal('bump', 'main', 'dirty', 'same')).toBe('main has uncommitted changes. Commit or remove them first.');
  });

  it('refuses either off main', () => {
    expect(mainRefusal('resume', 'feature', 'clean', 'same')).toBe('check out main first; the release builds main.');
    expect(mainRefusal('bump', '', 'clean', 'same')).toBe('check out main first; the release builds main.');
  });
});

describe('afterWatch', () => {
  it('watches again when the watch dropped while the run goes on', () => {
    expect(afterWatch('in_progress', '')).toBe('watch');
    expect(afterWatch('queued', '')).toBe('watch');
    expect(afterWatch('waiting', '')).toBe('watch');
  });

  it('installs a run that finished green after a dropped watch', () => {
    expect(afterWatch('completed', 'success')).toBe('install');
  });

  it('calls a completed run that is not green failed', () => {
    expect(afterWatch('completed', 'failure')).toBe('failed');
    expect(afterWatch('completed', 'cancelled')).toBe('failed');
  });
});
